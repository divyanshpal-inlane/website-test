-- =============================================================================
-- Funnel learner-request approval flow (ops = hosted app).
--   P2  confirm_booking_slots v2 — holds flip to 'tentative' (NOT 'booked') so
--       Ops can approve each paid booking before lessons go live on the roster.
--   P3  review_booking_slots — single RPC used by the review-booking edge
--       function: action 'approve' flips tentative -> booked (enabled=true),
--       action 'reject' flips tentative -> cancelled. Booking stays 'confirmed'
--       in both cases (money-safe; rejection only releases the slots + emails).
--   P4  change_booking_slot widened — tentative lessons are reschedulable too,
--       and the per-learner consecutive-slot rule counts them.
-- Additive / idempotent (create or replace). Service-role only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- P2: confirm_booking_slots v2 — flip held rows to 'tentative' instead of
-- 'booked'. Everything else (money-safe fallbacks, locks, consecutive rule)
-- is unchanged; the per-learner consecutive scan now includes tentative rows
-- from other bookings.
-- -----------------------------------------------------------------------------
create or replace function public.confirm_booking_slots(
  p_booking_id uuid,
  p_payment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_learner_id uuid;
  v_course_id uuid;
  v_created_at timestamptz;
  v_hold_minutes int;
  v_gap_mins int;
  v_gap interval;
  v_row record;
  v_day record;
  v_pair record;
  v_lesson_id uuid;
  v_lesson_index int := 1;
  v_scheduled int := 0;
  v_expected int;
  v_conflict boolean;
  v_rows jsonb := '[]'::jsonb;
begin
  -- 1. Serialize on the booking row.
  select b.status, b.learner_id, b.course_id, b.created_at
  into v_status, v_learner_id, v_course_id, v_created_at
  from public.booking b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found',
      'message', 'Booking not found.');
  end if;

  if v_status = 'confirmed' then
    return jsonb_build_object(
      'ok', true,
      'scheduling_mode', 'already_confirmed',
      'scheduled', 0
    );
  end if;

  if v_status not in ('created', 'payment_completed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_state',
      'message', 'Cannot confirm a booking in state "' || v_status || '".');
  end if;

  select coalesce((value->>'hold_minutes')::int, 30),
         coalesce((value->>'instructor_gap_minutes')::int, 0)
  into v_hold_minutes, v_gap_mins
  from public.app_settings
  where key = 'booking_flow';
  v_hold_minutes := coalesce(v_hold_minutes, 30);
  v_gap := make_interval(mins => coalesce(v_gap_mins, 0));

  -- 2+3. Advisory locks BEFORE touching any schedule row: learner/date, then
  --      instructor/date, both sorted (= same order as reserve/change).
  if v_status in ('created', 'payment_completed') then
    for v_day in
      select distinct s.date as d
      from public."Schedule" s
      where s.booking_id = p_booking_id
        and s.status = 'pending_payment'
      order by 1
    loop
      perform pg_advisory_xact_lock(
        hashtext('l:' || v_learner_id::text),
        (v_day.d - date '2000-01-01')::integer
      );
    end loop;

    for v_pair in
      select distinct s.instructor_id as i, s.date as d
      from public."Schedule" s
      where s.booking_id = p_booking_id
        and s.status = 'pending_payment'
      order by 1, 2
    loop
      perform pg_advisory_xact_lock(
        hashtext(v_pair.i::text),
        (v_pair.d - date '2000-01-01')::integer
      );
    end loop;
  end if;

  -- 4. Now it is safe to read the held rows (under booking + wedge locks).
  for v_row in
    select s.id, s.date, s.start_time, s.end_time
    from public."Schedule" s
    where s.booking_id = p_booking_id
      and s.status = 'pending_payment'
    order by s.id
    for update
  loop
    v_rows := v_rows || jsonb_build_object(
      'id', v_row.id,
      'date', v_row.date,
      'start_time', v_row.start_time,
      'end_time', v_row.end_time
    );
  end loop;

  if v_rows = '[]'::jsonb then
    -- Nothing held: money-safe schedule-later path.
    update public.booking set status = 'confirmed' where id = p_booking_id;
    return jsonb_build_object(
      'ok', true,
      'scheduling_mode', 'assign_later',
      'scheduled', 0
    );
  end if;

  -- Hold-window check on live state. A paid booking whose reservation window
  -- lapsed is still money-safe: the caller converts this to confirmed +
  -- needs-scheduling (team arranges lessons) instead of failing.
  if v_created_at < now() - make_interval(mins => v_hold_minutes) then
    update public."Schedule"
    set status = 'cancelled'
    where booking_id = p_booking_id
      and status = 'pending_payment';
    update public.booking set status = 'confirmed' where id = p_booking_id;
    return jsonb_build_object(
      'ok', false,
      'error', 'hold_expired',
      'message', 'Your reservation window expired while you paid.',
      'scheduling_mode', 'assign_later'
    );
  end if;

  -- Buffered travel-gap conflict re-scan vs other bookings (own rows are the
  -- occupied slots here, so any hit means an interloper — cancel + fall back).
  select exists (
    select 1
    from public."Schedule" o
    where o.status not in ('cancelled', 'rejected')
      and o.booking_id is distinct from p_booking_id
      and exists (
        select 1
        from public."Schedule" s
        where s.booking_id = p_booking_id
          and s.status = 'pending_payment'
          and s.instructor_id = o.instructor_id
          and s.date = o.date
          and o.start_time - v_gap < s.end_time
          and s.start_time < o.end_time + v_gap
      )
  )
  into v_conflict;

  if v_conflict then
    update public."Schedule"
    set status = 'cancelled'
    where booking_id = p_booking_id
      and status = 'pending_payment';
    update public.booking set status = 'confirmed' where id = p_booking_id;
    return jsonb_build_object(
      'ok', false,
      'error', 'slot_conflict',
      'message', 'One of your chosen slots became unavailable while you paid.',
      'scheduling_mode', 'assign_later'
    );
  end if;

  -- Per-learner consecutive-slot rule across all of the learner's bookings
  -- (defense in depth; reserve already guarantees single-booking compliance).
  -- Tentative lessons from other (paid) bookings count too.
  select exists (
    select 1
    from (
      select date,
             count(*) > 2 as too_many,
             bool_or(prev_end is not null and prev_end <> start_time) as not_consecutive
      from (
        select s.date, s.start_time,
               lag(s.end_time) over (partition by s.date order by s.start_time) as prev_end
        from public."Schedule" s
        join public.booking b on b.id = s.booking_id
        where b.learner_id = v_learner_id
          and s.status in ('pending_payment', 'booked', 'tentative')
      ) x
      group by date
    ) g
    where g.too_many or g.not_consecutive
  )
  into v_conflict;

  if v_conflict then
    update public."Schedule"
    set status = 'cancelled'
    where booking_id = p_booking_id
      and status = 'pending_payment';
    update public.booking set status = 'confirmed' where id = p_booking_id;
    return jsonb_build_object(
      'ok', false,
      'error', 'slot_conflict',
      'message', 'Your held schedule violates the booking rules.',
      'scheduling_mode', 'assign_later'
    );
  end if;

  -- Flip each held row to TENTATIVE (paid and held, but awaiting Ops approval):
  -- linked to the payment + course lesson, not yet on the live roster.
  v_expected := jsonb_array_length(v_rows);
  for v_row in
    select s.id,
           coalesce((
             select l.id from public."Lesson" l
             where l.course_id = v_course_id and l.number = v_lesson_index
             limit 1
           ), null) as lesson_id
    from public."Schedule" s
    where s.booking_id = p_booking_id
      and s.status = 'pending_payment'
    order by s.id
  loop
    update public."Schedule"
    set status = 'tentative',
        enabled = false,
        payment_id = p_payment_id,
        lesson_id = v_row.lesson_id,
        otp = null
    where id = v_row.id
      and booking_id = p_booking_id
      and status = 'pending_payment';

    if not found then
      -- Row released concurrently under our locks (defensive; cannot normally
      -- happen, thanks to the wedge locks).
      raise exception 'confirm_race lost a held row for booking %', p_booking_id
        using errcode = 'P0001';
    end if;

    v_scheduled := v_scheduled + 1;
    v_lesson_index := v_lesson_index + 1;
  end loop;

  if v_scheduled < v_expected then
    raise exception 'confirm_race partial flip for booking %', p_booking_id
      using errcode = 'P0001';
  end if;

  update public.booking
  set status = 'confirmed'
  where id = p_booking_id;

  return jsonb_build_object(
    'ok', true,
    'scheduling_mode', 'direct',
    'scheduled', v_scheduled,
    'rows', v_rows
  );
exception
  when others then
    if sqlerrm like '%confirm_race%' then
      update public."Schedule"
      set status = 'cancelled'
      where booking_id = p_booking_id
        and status = 'pending_payment';
      update public.booking set status = 'confirmed' where id = p_booking_id;
      return jsonb_build_object(
        'ok', false,
        'error', 'slot_conflict',
        'message', 'A lesson was released while you paid. Your slots are safe again — we''ll schedule for you.',
        'scheduling_mode', 'assign_later'
      );
    end if;
    raise;
end;
$$;

revoke all on function public.confirm_booking_slots(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_booking_slots(uuid, uuid)
  to service_role;

-- -----------------------------------------------------------------------------
-- P3: review_booking_slots — approve (tentative -> booked, enabled=true) or
-- reject (tentative -> cancelled) a paid booking's lessons. Serializes on the
-- booking row. Booking status is untouched (stays 'confirmed' — the refund/
-- escalation decision is out of scope here). Idempotent: applying an already
-- completed action returns already_applied=true.
-- -----------------------------------------------------------------------------
create or replace function public.review_booking_slots(
  p_booking_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_tentative int;
  v_flipped int;
begin
  if p_action not in ('approve', 'reject') then
    return jsonb_build_object('ok', false, 'error', 'invalid_action',
      'message', 'action must be "approve" or "reject".');
  end if;

  -- Serialize concurrent reviews on the booking row.
  select b.status into v_status
  from public.booking b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found',
      'message', 'Booking not found.');
  end if;

  -- Money-safe: only post-payment confirmed bookings carry tentative lessons.
  if v_status not in ('confirmed', 'payment_completed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_state',
      'message', 'This booking has no lessons awaiting review.');
  end if;

  select count(*) into v_tentative
  from public."Schedule"
  where booking_id = p_booking_id
    and status = 'tentative';

  if v_tentative = 0 then
    return jsonb_build_object('ok', true, 'already_applied', true,
      'action', p_action, 'flipped', 0);
  end if;

  if p_action = 'approve' then
    update public."Schedule"
    set status = 'booked',
        enabled = true
    where booking_id = p_booking_id
      and status = 'tentative';
  else
    update public."Schedule"
    set status = 'cancelled',
        enabled = false
    where booking_id = p_booking_id
      and status = 'tentative';
  end if;

  get diagnostics v_flipped = row_count;

  return jsonb_build_object('ok', true, 'action', p_action, 'flipped', v_flipped);
end;
$$;

revoke all on function public.review_booking_slots(uuid, text)
  from public, anon, authenticated;
grant execute on function public.review_booking_slots(uuid, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- P4: change_booking_slot — widen the accepted status set so paid lessons that
-- are still 'tentative' (awaiting Ops approval) are reschedulable, and the
-- consecutive-slot rule counts them like booked lessons.
-- -----------------------------------------------------------------------------
create or replace function public.change_booking_slot(
  p_booking_id uuid,
  p_schedule_id bigint,
  p_new_date date,
  p_new_start time
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public."Schedule"%rowtype;
  v_dur interval;
  v_end time;
  v_gap_mins int;
  v_gap interval;
  v_conflict boolean;
  v_day_count int;
  v_active text := 'pending_payment';
begin
  -- v_active = statuses that still count as live lessons for moving/rescheduling.
  v_active := 'pending_payment';
  -- Serialize concurrent operations on this booking.
  perform 1 from public.booking b where b.id = p_booking_id for update;

  select *
  into v_row
  from public."Schedule" s
  where s.id = p_schedule_id
    and s.booking_id = p_booking_id
    and s.status in ('pending_payment', 'booked', 'tentative')
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'not_found',
      'message', 'This held lesson was not found for your booking.'
    );
  end if;

  -- Free expired holds of other bookings so their slots become usable.
  perform public._expire_stale_booking_holds(p_booking_id);

  select coalesce((value->>'instructor_gap_minutes')::int, 0)
    into v_gap_mins
    from public.app_settings
    where key = 'booking_flow';
  v_gap := make_interval(mins => coalesce(v_gap_mins, 0));

  v_dur := v_row.end_time - v_row.start_time;
  v_end := p_new_start + v_dur;

  -- Serialize with queued reservations on the same instructor+date.
  perform pg_advisory_xact_lock(
    hashtext(v_row.instructor_id::text),
    (p_new_date - date '2000-01-01')::integer
  );

  -- Buffered conflict with OTHER bookings active rows; pure overlap with this
  -- booking's own lessons (consecutive placements pass).
  select exists (
    select 1
    from public."Schedule" o
    where o.instructor_id = v_row.instructor_id
      and o.date = p_new_date
      and o.status not in ('cancelled', 'rejected')
      and o.id <> p_schedule_id
      and o.booking_id is distinct from p_booking_id
      and o.start_time - v_gap < v_end
      and p_new_start < o.end_time + v_gap
  ) or exists (
    select 1
    from public."Schedule" o
    where o.booking_id = p_booking_id
      and o.instructor_id = v_row.instructor_id
      and o.date = p_new_date
      and o.status not in ('cancelled', 'rejected')
      and o.id <> p_schedule_id
      and o.start_time < v_end
      and p_new_start < o.end_time
  )
  into v_conflict;

  if v_conflict then
    return jsonb_build_object(
      'ok', false,
      'error', 'slot_conflict',
      'message', 'That time is no longer available or overlaps one of your other lessons. Please pick another slot.'
    );
  end if;

  -- Consecutive-slot rule after the move: max 2 lessons per day, same-day
  -- lessons back-to-back.
  select count(*) + 1
  into v_day_count
  from public."Schedule"
  where booking_id = p_booking_id
    and status in ('pending_payment', 'booked', 'tentative')
    and date = p_new_date
    and id <> p_schedule_id;

  if v_day_count > 2 then
    return jsonb_build_object(
      'ok', false,
      'error', 'slot_conflict',
      'message', 'You can book at most 2 lessons per day. Please pick another slot.'
    );
  end if;

  select exists (
    select 1
    from (
      select start_time,
             lag(end_time) over (order by start_time) as prev_end
      from (
        select o.start_time, o.end_time
        from public."Schedule" o
        where o.booking_id = p_booking_id
          and o.status in ('pending_payment', 'booked', 'tentative')
          and o.date = p_new_date
          and o.id <> p_schedule_id
        union all
        select p_new_start, v_end
      ) t
    ) t2
    where prev_end is not null and prev_end <> start_time
  )
  into v_conflict;

  if v_conflict then
    return jsonb_build_object(
      'ok', false,
      'error', 'slot_conflict',
      'message', 'Same-day lessons must be consecutive. Please pick another slot.'
    );
  end if;

  update public."Schedule"
  set date = p_new_date,
      start_time = p_new_start,
      end_time = v_end
  where id = p_schedule_id
    and booking_id = p_booking_id
    and status in ('pending_payment', 'booked', 'tentative');

  return jsonb_build_object(
    'ok', true,
    'schedule_id', p_schedule_id,
    'date', p_new_date,
    'start_time', p_new_start,
    'end_time', v_end
  );
exception
  when exclusion_violation then
    return jsonb_build_object(
      'ok', false,
      'error', 'slot_conflict',
      'message', 'That time was just taken by someone else. Please pick another slot.'
    );
end;
$$;

revoke all on function public.change_booking_slot(uuid, bigint, date, time)
  from public, anon, authenticated;
grant execute on function public.change_booking_slot(uuid, bigint, date, time)
  to service_role;