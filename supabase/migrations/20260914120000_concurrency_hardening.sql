-- =============================================================================
-- Concurrency hardening (approved plan P1-P4, 2026-09-14)
-- Closes the remaining race cases identified in the concurrency review:
--
--   P1  confirm_booking_slots(p_booking_id, p_payment_id)  — the WHOLE
--       "payment done -> release holds -> mark confirmed" transition moves into
--       one atomic RPC. Outcome is a confirmed booking with as many booked
--       lessons as it holds — never a confirmed booking wearing zero booked
--       rows (the old confirm-flip race, case 6b).
--
--   P2  change_booking_slot v3 — returns an explicit row count so a move that
--       touched nothing is reported as not_found (case 7), and re-checks the
--       hold window inside the transaction (case 6/6a).
--
--   P3  Per-learner day rule — "at most 2 lessons per day, same-day lessons
--       back-to-back" is now enforced ACROSS all of a learner's bookings
--       (was per booking_id), in both reserve and change, serialized on
--       per-(learner,date) advisory locks (case 11).
--
--   P4  _cleanup_stale_bookings() — janitor: expires stale holds for ALL
--       bookings (the shared helper now accepts NULL exclusion), marks stale
--       created bookings abandoned, and purges old conflict/abandoned bookings
--       plus their orphaned payments/enrollments after a grace window (case 12).
--
-- LOCKING DISCIPLINE (deadlock-free). Every RPC acquires locks in this exact
-- order:
--   1. its OWN booking row (FOR UPDATE) — serializes per-booking lifecycle ops;
--   2. per-(learner,date) advisory locks, ascending date;
--   3. per-(instructor,date) advisory locks, ascending (instructor,date);
--   4. ONLY THEN any Schedule row read/write (expire, scan, insert, flip).
-- Learner-lock keys are namespaced ('l:') so they can never collide with
-- instructor-lock keys. Because all write-side txs take advisories BEFORE
-- touching schedule rows, a tx that is blocked on another tx's advisory holds
-- no schedule-row locks, so advisory waits and row locks can never form a
-- cycle.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared: expire stale holds. NULL exclusion = expire for ALL bookings (janitor).
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
    and (p_exclude_booking_id is null or s.booking_id <> p_exclude_booking_id)
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
-- reserve_booking_slots v4 — v3 (travel gap, advisory serialization, out-of-tx
-- expiry) plus: per-learner day rule across ALL of the learner's bookings and
-- the canonical lock order (advisories before any schedule-row read/write).
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
  v_day record;
  v_pair record;
  v_reserved integer := 0;
  v_gap_mins int;
  v_gap interval;
  v_conflict boolean;
begin
  -- 1. Serialize concurrent calls for the same booking.
  perform 1 from public.booking b where b.id = p_booking_id for update;

  select coalesce((value->>'instructor_gap_minutes')::int, 0)
    into v_gap_mins
    from public.app_settings
    where key = 'booking_flow';
  v_gap_mins := coalesce(v_gap_mins, 0);
  v_gap := make_interval(mins => v_gap_mins);

  -- 2. Serialize every reservation that touches this learner on a given date
  --    (cross-booking same-learner lessons are judged on live state).
  for v_day in
    select distinct x.date as d
    from jsonb_to_recordset(p_slots) as x(date date, start_time time, end_time time, instructor_id uuid)
    order by 1
  loop
    perform pg_advisory_xact_lock(
      hashtext('l:' || p_learner_id::text),
      (v_day.d - date '2000-01-01')::integer
    );
  end loop;

  -- 3. Serialize every reservation touching the same instructor+date (sorted
  --    so two concurrent plans for one instructor can never deadlock).
  for v_pair in
    select distinct x.instructor_id as i, x.date as d
    from jsonb_to_recordset(p_slots) as x(date date, start_time time, end_time time, instructor_id uuid)
    order by 1, 2
  loop
    perform pg_advisory_xact_lock(
      hashtext(v_pair.i::text),
      (v_pair.d - date '2000-01-01')::integer
    );
  end loop;

  -- 4. Free up slots whose hold window lapsed (other bookings only). Under the
  --    advisories above, this can never race a confirm that is busy flipping.
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

  -- Consecutive-slot rule (max 2/day, same-day lessons back-to-back) across
  -- ALL of the learner's bookings, not just this one. Raising here rolls back
  -- every insert made above.
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
        where b.learner_id = p_learner_id
          and s.status in ('pending_payment', 'booked')
      ) x
      group by date
    ) g
    where g.too_many or g.not_consecutive
  )
  into v_conflict;

  if v_conflict then
    raise exception 'consecutive_slot_rule violated for learner %', p_learner_id
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
-- change_booking_slot v3 — v2 plus: hold-window re-check inside SQL, an
-- explicit row count (0 => not_found on the update), the per-learner day rule
-- judged across all of the learner's bookings, and the canonical lock order.
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
  v_learner_id uuid;
  v_booking_status text;
  v_created_at timestamptz;
  v_moved int;
  v_hold_minutes int;
begin
  -- 1. Serialize concurrent operations on this booking.
  perform 1 from public.booking b where b.id = p_booking_id for update;

  select b.learner_id, b.status, b.created_at
  into v_learner_id, v_booking_status, v_created_at
  from public.booking b
  where b.id = p_booking_id;

  -- Unlocked peek: does the row belong to this booking and is it changeable?
  select *
  into v_row
  from public."Schedule" s
  where s.id = p_schedule_id
    and s.booking_id = p_booking_id
    and s.status in ('pending_payment', 'booked');

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'not_found',
      'message', 'This held lesson was not found for your booking.'
    );
  end if;

  select coalesce((value->>'hold_minutes')::int, 30)
    into v_hold_minutes
    from public.app_settings
    where key = 'booking_flow';
  v_hold_minutes := coalesce(v_hold_minutes, 30);

  -- Hold-window re-check (only while still unpaid/created). Confirmed and
  -- payment_completed bookings are outside the hold window.
  if v_booking_status = 'created' and v_created_at < now() - make_interval(mins => v_hold_minutes) then
    return jsonb_build_object(
      'ok', false,
      'error', 'hold_expired',
      'message', 'Your reservation window expired. Please restart from the schedule step to pick fresh lesson times.'
    );
  end if;

  select coalesce((value->>'instructor_gap_minutes')::int, 0)
    into v_gap_mins
    from public.app_settings
    where key = 'booking_flow';
  v_gap := make_interval(mins => coalesce(v_gap_mins, 0));

  v_dur := v_row.end_time - v_row.start_time;
  v_end := p_new_start + v_dur;

  -- 2+3. Serialize with other operations on this learner/date and on the
  --      target instructor/date (learner lock first, then instructor lock).
  perform pg_advisory_xact_lock(
    hashtext('l:' || v_learner_id::text),
    (p_new_date - date '2000-01-01')::integer
  );
  perform pg_advisory_xact_lock(
    hashtext(v_row.instructor_id::text),
    (p_new_date - date '2000-01-01')::integer
  );

  -- 4. Free expired holds of other bookings under the advisories.
  perform public._expire_stale_booking_holds(p_booking_id);

  -- Re-read the row under the advisories; it cannot have moved since.
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
      'message', 'This held lesson was released while you were changing it. Please refresh and try again.'
    );
  end if;
  v_dur := v_row.end_time - v_row.start_time;
  v_end := p_new_start + v_dur;

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

  -- Consecutive-slot rule AFTER the move, judged across ALL of the learner's
  -- bookings: max 2 lessons per day, same-day lessons back-to-back.
  select count(*) + 1
  into v_day_count
  from public."Schedule" s
  join public.booking b on b.id = s.booking_id
  where b.learner_id = v_learner_id
    and s.status in ('pending_payment', 'booked')
    and s.date = p_new_date
    and s.id <> p_schedule_id;

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
        select s.start_time, s.end_time
        from public."Schedule" s
        join public.booking b on b.id = s.booking_id
        where b.learner_id = v_learner_id
          and s.status in ('pending_payment', 'booked')
          and s.date = p_new_date
          and s.id <> p_schedule_id
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

  get diagnostics v_moved = row_count;

  if v_moved = 0 then
    -- The row vanished under our locks (concurrent release). Report honestly.
    return jsonb_build_object(
      'ok', false,
      'error', 'not_found',
      'message', 'This held lesson was released while you were changing it. Please refresh and try again.'
    );
  end if;

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

-- -----------------------------------------------------------------------------
-- P1: confirm_booking_slots — atomic payment-to-confirmed transition.
-- Caller (confirm-booking edge function) guarantees a completed payment on a
-- linked enrollment; this RPC does everything else transactionally.
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
          and s.status in ('pending_payment', 'booked')
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

  -- Flip each held row: status booked, linked to the payment + course lesson.
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
    set status = 'booked',
        enabled = true,
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
-- P4: janitor — expire stale holds for everyone, mark stale created bookings
-- abandoned, purge old conflict/abandoned bookings + orphaned money rows.
-- Safe to run on any schedule (idempotent, additive).
-- -----------------------------------------------------------------------------
create or replace function public._cleanup_stale_bookings(
  p_hold_grace_minutes integer default 60,
  p_cleanup_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold_minutes int;
  v_row_count int;
  v_expired_holds integer := 0;
  v_abandoned integer := 0;
  v_purged_bookings integer := 0;
  v_purged_payments integer := 0;
  v_purged_enrollments integer := 0;
begin
  -- 1. Expire stale pending_payment holds for ALL bookings (NULL = no exclusion).
  perform public._expire_stale_booking_holds(null);
  get diagnostics v_expired_holds = row_count;

  select coalesce((value->>'hold_minutes')::int, 30)
    into v_hold_minutes
    from public.app_settings
    where key = 'booking_flow';
  v_hold_minutes := coalesce(v_hold_minutes, 30);

  -- 2. Mark stale unpaid (created) bookings abandoned and cancel their holds.
  update public."Schedule" s
  set status = 'cancelled'
  from public.booking b
  where b.id = s.booking_id
    and s.status = 'pending_payment'
    and b.status = 'created'
    and b.created_at < now() - make_interval(mins => v_hold_minutes + p_hold_grace_minutes);
  get diagnostics v_row_count = row_count;
  v_expired_holds := v_expired_holds + v_row_count;

  update public.booking
  set status = 'abandoned'
  where status = 'created'
    and created_at < now() - make_interval(mins => v_hold_minutes + p_hold_grace_minutes);
  get diagnostics v_abandoned = row_count;

  -- 3. Snapshot the purge set BEFORE deleting anything (old conflict/abandoned
  --    bookings), so the enrollment/payment cleanup below stays scoped to the
  --    booking flow and never touches legacy rows. Temp table dies with the
  --    transaction.
  create temp table _cleanup_targets on commit drop as
    select id, learner_id, course_id
    from public.booking
    where status in ('conflict', 'abandoned')
      and coalesce(updated_at, created_at) < now() - make_interval(days => p_cleanup_days);

  delete from public."Schedule" s
  using _cleanup_targets t
  where s.booking_id = t.id;

  delete from public.booking b
  using _cleanup_targets t
  where b.id = t.id;
  get diagnostics v_purged_bookings = row_count;

  -- 4. Orphaned money rows: enrollments (and their addons) whose learner+course
  --    was only ever represented by a conflict/abandoned booking and that hold
  --    no completed payment. Pending razorpay payments with no linked
  --    enrollment and older than the cleanup window are dropped too. Completed
  --    payments and live enrollments are never touched.
  delete from public.enrollment_addons ea
  where ea.enrollment_id in (
    select en.id
    from public.enrollment en
    where (en.payment_id is null or exists (
      select 1 from public.payment p where p.id = en.payment_id and p.status <> 'completed'
    ))
      and (en.learner_id, en.course_id) in (select t.learner_id, t.course_id from _cleanup_targets t)
  );

  delete from public.enrollment en
  where (en.payment_id is null or exists (
    select 1 from public.payment p where p.id = en.payment_id and p.status <> 'completed'
  ))
    and (en.learner_id, en.course_id) in (select t.learner_id, t.course_id from _cleanup_targets t);
  get diagnostics v_purged_enrollments = row_count;

  delete from public.payment p
  where p.status = 'pending'
    and p.gateway = 'razorpay'
    and not exists (
      select 1 from public.enrollment en where en.payment_id = p.id
    )
    and p.created_at < now() - make_interval(days => p_cleanup_days);
  get diagnostics v_purged_payments = row_count;

  return jsonb_build_object(
    'expired_holds', v_expired_holds,
    'abandoned_bookings', v_abandoned,
    'purged_bookings', v_purged_bookings,
    'purged_payments', v_purged_payments,
    'purged_enrollments', v_purged_enrollments
  );
end;
$$;

revoke all on function public._cleanup_stale_bookings(integer, integer)
  from public, anon, authenticated;
grant execute on function public._cleanup_stale_bookings(integer, integer)
  to service_role;