-- =============================================================================
-- Booking slot lifecycle (website direct booking, cloud-only DB)
-- Ties the "one instructor completes the whole course" model together at the
-- DB layer:
--   1. _expire_stale_booking_holds()  — held pending_payment rows whose 30-min
--      hold window has passed are cancelled inside the same transaction that
--      reserves/changes a slot, so expired holds stop occupying the
--      schedule_no_overlap_new_rows exclusion constraint. Kept in sync with the
--      availability engine, which already treats expired holds as free.
--   2. reserve_booking_slots() v2      — same atomic API as before, now cleaning
--      stale OTHER-holding holds first.
--   3. change_booking_slot()           — atomically moves a held lesson to a new
--      date/time for the same instructor (used by the change-booking-slot edge
--      function). Pre-check + the existing exclusion constraint are the
--      backstop; on any conflict the row is left untouched.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared: expire stale holds for bookings OTHER than the one in flight.
-- -----------------------------------------------------------------------------
create or replace function public._expire_stale_booking_holds(p_exclude_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold_minutes int;
begin
  select coalesce((value->>'hold_minutes')::int, 30)
    into v_hold_minutes
    from public.app_settings
    where key = 'booking_flow';
  v_hold_minutes := coalesce(v_hold_minutes, 30);

  update public."Schedule" s
  set status = 'cancelled'
  where s.status = 'pending_payment'
    and s.booking_id is not null
    and s.booking_id <> p_exclude_booking_id
    and exists (
      select 1 from public.booking b
      where b.id = s.booking_id
        and b.created_at < now() - make_interval(mins => v_hold_minutes)
    );
end;
$$;

revoke all on function public._expire_stale_booking_holds(uuid) from public, anon, authenticated;
grant execute on function public._expire_stale_booking_holds(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- reserve_booking_slots v2 — same contract, now expires stale holds first so a
-- booked-out-looking window genuinely reflects live occupancy.
-- -----------------------------------------------------------------------------
create or replace function public.reserve_booking_slots(
  p_booking_id uuid,
  p_learner_id uuid,
  p_course_id uuid,
  p_slots jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot record;
  v_reserved integer := 0;
begin
  -- Serialize concurrent calls for the same booking.
  perform 1 from public.booking b where b.id = p_booking_id for update;

  -- Free up slots whose hold window lapsed (other bookings only).
  perform public._expire_stale_booking_holds(p_booking_id);

  for v_slot in
    select *
    from jsonb_to_recordset(p_slots) as t(
      date date,
      start_time time,
      end_time time,
      instructor_id uuid
    )
  loop
    -- Lock any conflicting schedule for this instructor so two concurrent
    -- reservations serialize on the same rows.
    perform 1
    from public."Schedule" s
    where s.instructor_id = v_slot.instructor_id
      and s.date = v_slot.date
      and s.status not in ('cancelled', 'rejected')
      and s.start_time < v_slot.end_time
      and v_slot.start_time < s.end_time
    for update;

    if found then
      return jsonb_build_object(
        'ok', false,
        'error', 'slot_conflict',
        'message', 'This time slot is no longer available. Please choose another slot.',
        'slot', jsonb_build_object(
          'date', v_slot.date,
          'start_time', v_slot.start_time,
          'end_time', v_slot.end_time
        )
      );
    end if;

    insert into public."Schedule" (
      learner_id, instructor_id, course_id, lesson_id,
      date, start_time, end_time, status, enabled, booking_id, payment_id
    )
    values (
      p_learner_id, v_slot.instructor_id, p_course_id, null,
      v_slot.date, v_slot.start_time, v_slot.end_time,
      'pending_payment', false, p_booking_id, null
    );

    v_reserved := v_reserved + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'reserved', v_reserved,
    'booking_id', p_booking_id
  );
exception
  when exclusion_violation then
    return jsonb_build_object(
      'ok', false,
      'error', 'slot_conflict',
      'message', 'This time slot was just taken by someone else. Please choose another slot.'
    );
end;
$$;

revoke all on function public.reserve_booking_slots(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_booking_slots(uuid, uuid, uuid, jsonb)
  to service_role;

-- -----------------------------------------------------------------------------
-- change_booking_slot — atomically move one held lesson (same instructor) to a
-- new date/time. Guarded by grid validation in the edge function, this RPC
-- re-checks overlaps (including the booking's own other lessons) before the
-- in-place UPDATE; the exclusion constraint catches mid-flight races.
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
  v_conflict boolean;
begin
  -- Serialize concurrent operations on this booking.
  perform 1 from public.booking b where b.id = p_booking_id for update;

  select *
  into v_row
  from public."Schedule" s
  where s.id = p_schedule_id
    and s.booking_id = p_booking_id
    and s.status = 'pending_payment'
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

  v_dur := v_row.end_time - v_row.start_time;
  v_end := p_new_start + v_dur;

  -- Overlap pre-check (active rows only; excludes the row being moved; also
  -- blocks times that collide with the booking's own other lessons).
  select exists (
    select 1
    from public."Schedule" o
    where o.instructor_id = v_row.instructor_id
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
      'message', 'That time is no longer available. Please pick another slot.'
    );
  end if;

  update public."Schedule"
  set date = p_new_date,
      start_time = p_new_start,
      end_time = v_end
  where id = p_schedule_id
    and booking_id = p_booking_id
    and status = 'pending_payment';

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