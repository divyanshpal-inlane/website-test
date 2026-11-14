-- Funnel -> Operations routing layer (additive only).
--
-- A funnel purchase already lives in booking / payment / enrollment /
-- ll_applications / Schedule. This adds the three things that do NOT exist:
--   * ops_workstream  one row per service line (class | licence | migration)
--                     of a purchase, linking the existing operational rows
--   * ops_exception   actionable, owned, resolvable exceptions
--   * ops_event       operational audit trail (routing + ownership)
-- Progress (lessons done, LL stage, ...) is NOT copied here; it stays in
-- Schedule / ll_applications and is read from there.
--
-- Security: RLS on, no policies, no grants => service-role only (same posture
-- as booking). The webapp reads through get_funnel_ops_requests(), which
-- verifies the caller is a row in "Admin" before returning anything.

create table if not exists public.ops_workstream (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references public.booking(id) on delete cascade,
  learner_id          uuid references public."Learner"(id) on delete set null,
  kind                text not null check (kind in ('class', 'licence', 'migration')),
  status              text not null default 'active'
                        check (status in ('pending', 'active', 'blocked', 'completed', 'cancelled')),
  service_codes       text[] not null default '{}',
  total_units         integer,
  enrollment_id       uuid references public.enrollment(id) on delete set null,
  ll_application_id   uuid references public.ll_applications(id) on delete set null,
  owner_queue         text,
  owner_ref           text,
  owner_assigned_at   timestamptz,
  next_action         text,
  next_action_due_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint ops_workstream_booking_kind_key unique (booking_id, kind)
);

create index if not exists idx_ops_workstream_learner on public.ops_workstream (learner_id);
create index if not exists idx_ops_workstream_open
  on public.ops_workstream (status, next_action_due_at) where status in ('pending', 'active', 'blocked');

create table if not exists public.ops_exception (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.booking(id) on delete cascade,
  workstream_id    uuid references public.ops_workstream(id) on delete set null,
  learner_id       uuid references public."Learner"(id) on delete set null,
  code             text not null,
  severity         text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  detail           jsonb not null default '{}'::jsonb,
  status           text not null default 'open' check (status in ('open', 'resolved')),
  owner_queue      text,
  opened_at        timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by      text,
  resolution_note  text,
  constraint ops_exception_booking_code_key unique (booking_id, code)
);

create index if not exists idx_ops_exception_open on public.ops_exception (status, opened_at) where status = 'open';

create table if not exists public.ops_event (
  id              bigint generated always as identity primary key,
  booking_id      uuid references public.booking(id) on delete cascade,
  workstream_id   uuid references public.ops_workstream(id) on delete set null,
  learner_id      uuid references public."Learner"(id) on delete set null,
  event_type      text not null,
  actor           text not null default 'system',
  source          text not null default 'funnel',
  correlation_id  uuid,
  dedupe_key      text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  constraint ops_event_dedupe_key_key unique (dedupe_key)
);

create index if not exists idx_ops_event_booking on public.ops_event (booking_id, created_at);

alter table public.ops_workstream enable row level security;
alter table public.ops_exception  enable row level security;
alter table public.ops_event      enable row level security;

revoke all on public.ops_workstream from public, anon, authenticated;
revoke all on public.ops_exception  from public, anon, authenticated;
revoke all on public.ops_event      from public, anon, authenticated;

comment on table public.ops_workstream is
  'One service line (class | licence | migration) of a funnel purchase. Links booking to the existing enrollment / ll_applications rows; progress is read from those, not copied.';
comment on table public.ops_exception is
  'Actionable operational exception for a funnel purchase. Unique per (booking_id, code) so routing retries never duplicate it.';
comment on table public.ops_event is
  'Operational audit trail for funnel routing and ownership. Funnel analytics stay in lead_events.';

-- Read model for the Operations Control Tower. Admin-only: the caller's JWT
-- phone must match a row in "Admin" (is_admin or is_super_admin). Phone numbers
-- are returned masked.
create or replace function public.get_funnel_ops_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller text := right(regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '\D', '', 'g'), 10);
  allowed boolean;
begin
  select exists (
    select 1 from "Admin" a
    where caller <> ''
      and right(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), 10) = caller
      and (coalesce(a.is_admin, false) or coalesce(a.is_super_admin, false))
  ) into allowed;
  if not allowed then
    raise exception 'forbidden' using errcode = '42501';
  end if;

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
        coalesce((select jsonb_agg(jsonb_build_object('code', e.code, 'severity', e.severity, 'opened_at', e.opened_at))
                  from ops_exception e
                  where e.booking_id = w.booking_id and e.status = 'open'
                    and (e.workstream_id = w.id or e.workstream_id is null)), '[]'::jsonb) as open_exceptions
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
