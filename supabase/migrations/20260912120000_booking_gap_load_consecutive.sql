-- =============================================================================
-- Slot formation rules v2 (cloud-only DB) — deployed after the slot-selection
-- engine changes:
--   1. Instructor travel gap: every OTHER booking's active Schedule row blocks
--      the window [start - instructor_gap_minutes, end + instructor_gap_minutes]
--      on that instructor+date. This booking's own rows keep the old pure
--      overlap rule so consecutive same-learner lessons sit back-to-back.
--   2. Concurrency backstop: reservations/changes serialize on the booking row
--      AND take a per-(instructor, date) advisory lock so two simultaneous
--      bookings can't sneak a travel-gap-invalid slot in between each other.
--   3. Consecutive-slot booking rule: at most 2 lessons per learner per day,
--      same-day lessons must be back-to-back. Enforced here so direct DB writes
--      (or a race) can never produce a non-compliant held schedule.
-- Drives instructor_gap_minutes from booking_flow.app_settings (fail-closed
-- strictness: absent => 0, i.e. pure-overlap behaviour, never a guessed value).
-- =============================================================================

-- Seed the config field once, without clobbering any operator-set value.
update public.app_settings
set value = value || jsonb_build_object('instructor_gap_minutes', 30)
where key = 'booking_flow'
  and not value ? 'instructor_gap_minutes';

-- -----------------------------------------------------------------------------
-- reserve_booking_slots v3 — travel-gap conflicts + advisory serialization.
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
  v_gap_mins int;
  v_gap interval;
  v_conflict boolean;
begin
  -- Serialize concurrent calls for the same booking.
  perform 1 from public.booking b where b.id = p_booking_id for update;

  -- Free up slots whose hold window lapsed (other bookings only).
  perform public._expire_stale_booking_holds(p_booking_id);

  select coalesce((value->>'instructor_gap_minutes')::int, 0)
    into v_gap_mins
    from public.app_settings
    where key = 'booking_flow';
  v_gap_mins := coalesce(v_gap_mins, 0);
  v_gap := make_interval(mins => v_gap_mins);

  for v_slot in
    select *
    from jsonb_to_recordset(p_slots) as t(
      date date,
      start_time time,
      end_time time,
      instructor_id uuid
    )
  loop
    -- Serialize every reservation touching the same instructor+date so two
    -- simultaneous bookings can't slip a travel-gap-invalid slot in.
    perform pg_advisory_xact_lock(
      hashtext(v_slot.instructor_id::text),
      (v_slot.date - date '2000-01-01')::integer
    );

    -- OTHER bookings' active rows block the travel-gap-extended window.
    select exists (
      select 1
      from public."Schedule" o
      where o.instructor_id = v_slot.instructor_id
        and o.date = v_slot.date
        and o.status not in ('cancelled', 'rejected')
        and o.booking_id is distinct from p_booking_id
        and o.start_time - v_gap < v_slot.end_time
        and v_slot.start_time < o.end_time + v_gap
    )
    into v_conflict;

    if v_conflict then
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

    -- This booking's own rows still can't overlap (consecutive same-learner
    -- pairs are non-overlapping so they pass here unchanged).
    select exists (
      select 1
      from public."Schedule" o
      where o.booking_id = p_booking_id
        and o.instructor_id = v_slot.instructor_id
        and o.date = v_slot.date
        and o.status not in ('cancelled', 'rejected')
        and o.start_time < v_slot.end_time
        and v_slot.start_time < o.end_time
    )
    into v_conflict;

    if v_conflict then
      return jsonb_build_object(
        'ok', false,
        'error', 'slot_conflict',
        'message', 'This time slot overlaps one of your other lessons. Please choose another slot.',
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

  -- Consecutive-slot rule (max 2/day, same-day lessons back-to-back). The
  -- engine generates compliant plans; this is the DB backstop. Raising here
  -- rolls back every insert made above.
  select exists (
    select 1
    from (
      select date,
             count(*) > 2 as too_many,
             bool_or(prev_end is not null and prev_end <> start_time) as not_consecutive
      from (
        select date, start_time,
               lag(end_time) over (partition by date order by start_time) as prev_end
        from public."Schedule"
        where booking_id = p_booking_id
          and status = 'pending_payment'
      ) t
      group by date
    ) g
    where g.too_many or g.not_consecutive
  )
  into v_conflict;

  if v_conflict then
    raise exception 'consecutive_slot_rule violated for booking %', p_booking_id
      using errcode = 'P0001';
  end if;

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
  when others then
    if sqlerrm like '%consecutive_slot_rule%' then
      return jsonb_build_object(
        'ok', false,
        'error', 'slot_conflict',
        'message', 'The generated schedule violates the booking rules. Please choose another slot.'
      );
    end if;
    raise;
end;
$$;

revoke all on function public.reserve_booking_slots(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_booking_slots(uuid, uuid, uuid, jsonb)
  to service_role;

-- -----------------------------------------------------------------------------
-- change_booking_slot v2 — travel-gap conflicts + consecutive-slot rule +
-- advisory serialization on the target instructor+date.
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
begin
  -- Serialize concurrent operations on this booking.
  perform 1 from public.booking b where b.id = p_booking_id for update;

  select *
  into v_row
  from public."Schedule" s
  where s.id = p_schedule_id
    and s.booking_id = p_booking_id
    and s.status in ('pending_payment', 'booked')
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
    and status in ('pending_payment', 'booked')
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
          and o.status in ('pending_payment', 'booked')
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
    and status in ('pending_payment', 'booked');

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