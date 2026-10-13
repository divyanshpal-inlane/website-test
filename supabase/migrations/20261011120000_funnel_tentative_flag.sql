-- =============================================================================
-- Funnel tentative flag alignment.
--
-- Problem: the hosted app detects a tentative lesson via the LEGACY
-- Schedule."isTentative" boolean (the Sales Dashboard's unpaid hold marker:
-- isTentative=true + status='hold'), while the funnel only set
-- status='tentative'. Every surface that keys off isTentative therefore
-- rendered a paid-but-unapproved funnel lesson as a LIVE booking:
--   - Instructor Management "View Schedule" timetable (getScheduleColors)
--   - the instructor's own day view (queries/instructor.ts filters !isTentative)
--   - instructor matrix / earnings / control tower
--   - the daily notification emails (funnel lessons were emailed before Ops
--     approved them)
--
-- Fix (no frontend change): set Schedule."isTentative" = true on the same
-- update that flips a held row to 'tentative', and clear it (false) in
-- review_booking_slots on approve/reject. The funnel branch on the Sales
-- Dashboard keys off status, not isTentative, and its isSalesTentative guards
-- status ∈ {hold,booked}, so this introduces no delete/edit action there.
--
-- Additive / idempotent (create or replace). Service-role only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- confirm_booking_slots v3 — identical to v2 except the flip to 'tentative'
-- also sets "isTentative" = true (so the lesson is hidden/labeled tentative
-- everywhere until Ops approves it).
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
  -- "isTentative" = true mirrors the app's canonical tentative marker so the
  -- instructor views / matrix / earnings / daily emails treat it as tentative.
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
        "isTentative" = true,
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
-- review_booking_slots v2 — identical to v1 except approve/reject also clear
-- "isTentative" (false) alongside the status flip, so an approved lesson joins
-- the live roster and a rejected one drops out of every tentative view.
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
        "isTentative" = false,
        enabled = true
    where booking_id = p_booking_id
      and status = 'tentative';
  else
    update public."Schedule"
    set status = 'cancelled',
        "isTentative" = false,
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
-- Backfill: existing funnel tentative lessons (created before this fix) carry
-- status='tentative' but isTentative = NULL. Align them so the current roster
-- is consistent too. Idempotent.
-- -----------------------------------------------------------------------------
update public."Schedule"
set "isTentative" = true
where status = 'tentative'
  and "isTentative" is distinct from true;
