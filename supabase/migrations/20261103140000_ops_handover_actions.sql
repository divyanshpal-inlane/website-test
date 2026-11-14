-- Ops actions on routed funnel requests: owner assignment, exception resolution,
-- next-action updates, handover + acceptance, contact log. Additive only.
--
-- All writes go through admin-only SECURITY DEFINER functions (the tables stay
-- service-role only: RLS on, no policies, no grants). Every function:
--   * requires the caller's JWT phone to match an "Admin" row (is_admin / is_super_admin)
--   * writes an ops_event row (actor = admin name) so ownership changes are auditable
-- Handover rule (Ops guide): the current owner stays accountable until the
-- receiving owner ACCEPTS - a pending handover never changes the workstream owner.

create or replace function public.ops_current_admin()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller text := right(regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '\D', '', 'g'), 10);
  nm text;
begin
  select coalesce(nullif(trim(a.name), ''), caller) into nm
  from "Admin" a
  where caller <> ''
    and right(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), 10) = caller
    and (coalesce(a.is_admin, false) or coalesce(a.is_super_admin, false))
  limit 1;
  if nm is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return nm;
end;
$$;
revoke all on function public.ops_current_admin() from public, anon;
grant execute on function public.ops_current_admin() to authenticated;

create table if not exists public.ops_handover (
  id             uuid primary key default gen_random_uuid(),
  workstream_id  uuid not null references public.ops_workstream(id) on delete cascade,
  booking_id     uuid not null references public.booking(id) on delete cascade,
  stage          text not null,
  from_queue     text,
  from_ref       text,
  to_queue       text,
  to_ref         text,
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  payload        jsonb not null default '{}'::jsonb,
  note           text,
  requested_by   text not null,
  requested_at   timestamptz not null default now(),
  responded_by   text,
  responded_at   timestamptz,
  response_note  text,
  constraint ops_handover_receiver_present check (coalesce(trim(to_queue), '') <> '' or coalesce(trim(to_ref), '') <> '')
);
-- at most one open handover per workstream
create unique index if not exists idx_ops_handover_one_pending on public.ops_handover (workstream_id) where status = 'pending';
create index if not exists idx_ops_handover_booking on public.ops_handover (booking_id, requested_at);

create table if not exists public.ops_notification_log (
  id            bigint generated always as identity primary key,
  booking_id    uuid not null references public.booking(id) on delete cascade,
  workstream_id uuid references public.ops_workstream(id) on delete set null,
  learner_id    uuid references public."Learner"(id) on delete set null,
  channel       text not null check (channel in ('call', 'whatsapp', 'sms', 'email', 'in_app', 'other')),
  message_type  text not null,
  direction     text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  status        text not null default 'sent' check (status in ('planned', 'sent', 'delivered', 'failed', 'no_answer')),
  note          text,
  follow_up_at  timestamptz,
  logged_by     text not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_ops_notification_log_booking on public.ops_notification_log (booking_id, created_at desc);

alter table public.ops_handover          enable row level security;
alter table public.ops_notification_log  enable row level security;
revoke all on public.ops_handover         from public, anon, authenticated;
revoke all on public.ops_notification_log from public, anon, authenticated;

comment on table public.ops_handover is
  'Owner handover between queues/people. Ownership only moves when status becomes accepted.';
comment on table public.ops_notification_log is
  'Log of customer contacts (manual or automated) per request/workstream. Nothing is sent from here.';

-- ---------------------------------------------------------------- actions

create or replace function public.ops_assign_owner(p_workstream uuid, p_queue text, p_ref text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text := ops_current_admin();
  w ops_workstream%rowtype;
  q text := nullif(trim(coalesce(p_queue, '')), '');
  r text := nullif(trim(coalesce(p_ref, '')), '');
begin
  if q is null and r is null then
    raise exception 'owner queue or owner is required' using errcode = '22023';
  end if;
  select * into w from ops_workstream where id = p_workstream for update;
  if not found then raise exception 'workstream not found' using errcode = 'P0002'; end if;

  update ops_workstream
     set owner_queue = q, owner_ref = r, owner_assigned_at = now(), updated_at = now()
   where id = w.id;

  update ops_exception
     set status = 'resolved', resolved_at = now(), resolved_by = actor, resolution_note = 'owner assigned'
   where booking_id = w.booking_id and code = 'owner_unassigned_' || w.kind and status = 'open';

  insert into ops_event (booking_id, workstream_id, learner_id, event_type, actor, source, metadata)
  values (w.booking_id, w.id, w.learner_id, 'owner_assigned', actor, 'webapp',
          jsonb_build_object('from_queue', w.owner_queue, 'from_ref', w.owner_ref, 'to_queue', q, 'to_ref', r, 'note', p_note));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.ops_update_next_action(p_workstream uuid, p_action text, p_due timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text := ops_current_admin();
  w ops_workstream%rowtype;
  a text := nullif(trim(coalesce(p_action, '')), '');
begin
  if a is null then raise exception 'next action is required' using errcode = '22023'; end if;
  select * into w from ops_workstream where id = p_workstream for update;
  if not found then raise exception 'workstream not found' using errcode = 'P0002'; end if;
  update ops_workstream set next_action = a, next_action_due_at = p_due, updated_at = now() where id = w.id;
  insert into ops_event (booking_id, workstream_id, learner_id, event_type, actor, source, metadata)
  values (w.booking_id, w.id, w.learner_id, 'next_action_updated', actor, 'webapp',
          jsonb_build_object('from', w.next_action, 'to', a, 'due', p_due));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.ops_resolve_exception(p_exception uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text := ops_current_admin();
  e ops_exception%rowtype;
  n text := nullif(trim(coalesce(p_note, '')), '');
begin
  -- Never close an exception just because a status changed: record the evidence.
  if n is null then raise exception 'a resolution note is required' using errcode = '22023'; end if;
  select * into e from ops_exception where id = p_exception for update;
  if not found then raise exception 'exception not found' using errcode = 'P0002'; end if;
  if e.status = 'resolved' then return jsonb_build_object('ok', true, 'alreadyResolved', true); end if;
  update ops_exception set status = 'resolved', resolved_at = now(), resolved_by = actor, resolution_note = n where id = e.id;
  insert into ops_event (booking_id, workstream_id, learner_id, event_type, actor, source, metadata)
  values (e.booking_id, e.workstream_id, e.learner_id, 'exception_resolved', actor, 'webapp',
          jsonb_build_object('code', e.code, 'note', n));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.ops_initiate_handover(p_workstream uuid, p_stage text, p_to_queue text, p_to_ref text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text := ops_current_admin();
  w ops_workstream%rowtype;
  tq text := nullif(trim(coalesce(p_to_queue, '')), '');
  tr text := nullif(trim(coalesce(p_to_ref, '')), '');
  st text := nullif(trim(coalesce(p_stage, '')), '');
  snap jsonb;
  hid uuid;
begin
  if st is null then raise exception 'handover stage is required' using errcode = '22023'; end if;
  if tq is null and tr is null then raise exception 'receiving owner or queue is required' using errcode = '22023'; end if;
  select * into w from ops_workstream where id = p_workstream for update;
  if not found then raise exception 'workstream not found' using errcode = 'P0002'; end if;
  if exists (select 1 from ops_handover where workstream_id = w.id and status = 'pending') then
    raise exception 'a handover is already pending for this workstream' using errcode = '23505';
  end if;

  -- Snapshot of what the receiver needs (Ops guide: completed work, remaining work,
  -- payment status, open issues, next action + due date). Read live, not invented.
  snap := jsonb_build_object(
    'kind', w.kind,
    'total_units', w.total_units,
    'scheduled_lessons', (select count(*) from "Schedule" s where s.booking_id = w.booking_id and s.status in ('tentative', 'booked')),
    'confirmed_lessons', (select count(*) from "Schedule" s where s.booking_id = w.booking_id and s.status = 'booked'),
    'll_status', (select la.status from ll_applications la where la.id = w.ll_application_id),
    'payment_status', (select en.payment_status::text from enrollment en where en.id = w.enrollment_id),
    'booking_status', (select b.status from booking b where b.id = w.booking_id),
    'amount', (select b.total_amount from booking b where b.id = w.booking_id),
    'open_exceptions', coalesce((select jsonb_agg(e.code) from ops_exception e where e.booking_id = w.booking_id and e.status = 'open'), '[]'::jsonb),
    'next_action', w.next_action,
    'next_action_due_at', w.next_action_due_at
  );

  insert into ops_handover (workstream_id, booking_id, stage, from_queue, from_ref, to_queue, to_ref, payload, note, requested_by)
  values (w.id, w.booking_id, st, w.owner_queue, w.owner_ref, tq, tr, snap, p_note, actor)
  returning id into hid;

  insert into ops_event (booking_id, workstream_id, learner_id, event_type, actor, source, metadata)
  values (w.booking_id, w.id, w.learner_id, 'handover_initiated', actor, 'webapp',
          jsonb_build_object('handover_id', hid, 'stage', st, 'to_queue', tq, 'to_ref', tr));
  return jsonb_build_object('ok', true, 'handoverId', hid);
end;
$$;

create or replace function public.ops_respond_handover(p_handover uuid, p_accept boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text := ops_current_admin();
  h ops_handover%rowtype;
  w ops_workstream%rowtype;
begin
  select * into h from ops_handover where id = p_handover for update;
  if not found then raise exception 'handover not found' using errcode = 'P0002'; end if;
  if h.status <> 'pending' then
    return jsonb_build_object('ok', true, 'alreadyResponded', true, 'status', h.status);
  end if;
  select * into w from ops_workstream where id = h.workstream_id for update;

  if p_accept then
    -- Ownership moves ONLY now; until here the sender stayed accountable.
    update ops_workstream
       set owner_queue = h.to_queue, owner_ref = h.to_ref, owner_assigned_at = now(), updated_at = now()
     where id = w.id;
    update ops_handover set status = 'accepted', responded_by = actor, responded_at = now(), response_note = p_note where id = h.id;
    update ops_exception
       set status = 'resolved', resolved_at = now(), resolved_by = actor, resolution_note = 'handover accepted'
     where booking_id = w.booking_id and code in ('owner_unassigned_' || w.kind, 'handover_rejected') and status = 'open';
  else
    update ops_handover set status = 'rejected', responded_by = actor, responded_at = now(), response_note = p_note where id = h.id;
    insert into ops_exception (booking_id, workstream_id, learner_id, code, severity, detail, owner_queue)
    values (w.booking_id, w.id, w.learner_id, 'handover_rejected', 'warning',
            jsonb_build_object('handover_id', h.id, 'stage', h.stage, 'note', p_note), w.owner_queue)
    on conflict (booking_id, code) do update
       set status = 'open', resolved_at = null, resolved_by = null, resolution_note = null,
           detail = excluded.detail, opened_at = now();
  end if;

  insert into ops_event (booking_id, workstream_id, learner_id, event_type, actor, source, metadata)
  values (w.booking_id, w.id, w.learner_id, case when p_accept then 'handover_accepted' else 'handover_rejected' end, actor, 'webapp',
          jsonb_build_object('handover_id', h.id, 'stage', h.stage, 'note', p_note));
  return jsonb_build_object('ok', true, 'status', case when p_accept then 'accepted' else 'rejected' end);
end;
$$;

create or replace function public.ops_log_notification(
  p_booking uuid, p_workstream uuid, p_channel text, p_message_type text,
  p_status text default 'sent', p_note text default null, p_follow_up timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text := ops_current_admin();
  b booking%rowtype;
begin
  select * into b from booking where id = p_booking;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if nullif(trim(coalesce(p_message_type, '')), '') is null then
    raise exception 'message type is required' using errcode = '22023';
  end if;
  insert into ops_notification_log (booking_id, workstream_id, learner_id, channel, message_type, status, note, follow_up_at, logged_by)
  values (b.id, p_workstream, b.learner_id, p_channel, trim(p_message_type), p_status, p_note, p_follow_up, actor);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.get_ops_queue_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare opts jsonb;
begin
  perform ops_current_admin();
  select coalesce(value -> 'queue_options', '[]'::jsonb) into opts from app_settings where key = 'ops_routing';
  return coalesce(opts, '[]'::jsonb);
end;
$$;

revoke all on function public.ops_assign_owner(uuid, text, text, text) from public, anon;
revoke all on function public.ops_update_next_action(uuid, text, timestamptz) from public, anon;
revoke all on function public.ops_resolve_exception(uuid, text) from public, anon;
revoke all on function public.ops_initiate_handover(uuid, text, text, text, text) from public, anon;
revoke all on function public.ops_respond_handover(uuid, boolean, text) from public, anon;
revoke all on function public.ops_log_notification(uuid, uuid, text, text, text, text, timestamptz) from public, anon;
revoke all on function public.get_ops_queue_options() from public, anon;
grant execute on function public.ops_assign_owner(uuid, text, text, text) to authenticated;
grant execute on function public.ops_update_next_action(uuid, text, timestamptz) to authenticated;
grant execute on function public.ops_resolve_exception(uuid, text) to authenticated;
grant execute on function public.ops_initiate_handover(uuid, text, text, text, text) to authenticated;
grant execute on function public.ops_respond_handover(uuid, boolean, text) to authenticated;
grant execute on function public.ops_log_notification(uuid, uuid, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.get_ops_queue_options() to authenticated;

-- Read model v2: adds exception ids, the pending handover and the latest contact.
create or replace function public.get_funnel_ops_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform ops_current_admin();

  return coalesce((
    select jsonb_agg(row_to_json(r) order by r.created_at desc)
    from (
      select
        w.id, w.booking_id, w.kind, w.status, w.service_codes, w.total_units,
        w.owner_queue, w.owner_ref, w.next_action, w.next_action_due_at, w.created_at,
        b.status as booking_status, b.case_type, b.course_name, b.total_amount,
        l.id as learner_id, l.name as learner_name,
        case when l.phone is null then null else '******' || right(l.phone, 4) end as learner_phone_masked,
        (select count(*) from "Schedule" s
          where s.booking_id = w.booking_id and s.status in ('tentative', 'booked')) as scheduled_lessons,
        (select count(*) from "Schedule" s
          where s.booking_id = w.booking_id and s.status = 'booked' and w.kind = 'class') as confirmed_lessons,
        (select la.status from ll_applications la where la.id = w.ll_application_id) as ll_status,
        coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'code', e.code, 'severity', e.severity, 'opened_at', e.opened_at))
                  from ops_exception e
                  where e.booking_id = w.booking_id and e.status = 'open'
                    and (e.workstream_id = w.id or e.workstream_id is null)), '[]'::jsonb) as open_exceptions,
        (select jsonb_build_object('id', h.id, 'stage', h.stage, 'to_queue', h.to_queue, 'to_ref', h.to_ref,
                                   'from_queue', h.from_queue, 'from_ref', h.from_ref, 'requested_by', h.requested_by,
                                   'requested_at', h.requested_at, 'note', h.note, 'payload', h.payload)
           from ops_handover h where h.workstream_id = w.id and h.status = 'pending') as pending_handover,
        (select jsonb_build_object('channel', n.channel, 'message_type', n.message_type, 'status', n.status,
                                   'follow_up_at', n.follow_up_at, 'created_at', n.created_at, 'logged_by', n.logged_by)
           from ops_notification_log n where n.booking_id = w.booking_id order by n.created_at desc limit 1) as last_contact
      from ops_workstream w
      join booking b on b.id = w.booking_id
      left join "Learner" l on l.id = w.learner_id
      order by w.created_at desc
      limit 500
    ) r
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_funnel_ops_requests() from public, anon;
grant execute on function public.get_funnel_ops_requests() to authenticated;
