-- =============================================================================
-- 20260905120000_booking_janitor_scheduling.sql
--
-- Makes the booking funnel self-cleaning in production.
--
-- Two problems this fixes:
--
--   1. NOTHING scheduled the janitors. `_expire_stale_booking_holds` was only
--      ever called from inside the RPCs (so it ran only when a customer was
--      actively booking). `create-booking` additionally wrote a `booking` row +
--      a `pending` enrollment *before* reserving slots, so any failure after
--      that point (plan no longer feasible, RPC slot_conflict, addon insert
--      error) left a `conflict` booking and an orphaned pending enrollment
--      behind. Production has no pg_cron entry to collect them.
--      -> Fixed in code too (create-booking now rolls its own rows back), but a
--         hard process kill can still skip that, so the DB needs a janitor.
--
--   2. The janitor's payment purge was DANGEROUS on the production database.
--      It deleted *any* `payment` row with status='pending', gateway='razorpay',
--      no linked enrollment and created_at < now() - cleanup_days. That is not
--      scoped to the booking funnel at all — it reaches the live app's own
--      payments. Measured on prod before this migration: **170 rows would have
--      been deleted**. This version snapshots only the payments that were
--      attached to the enrollments we are about to remove, so it can only ever
--      reclaim orphans this funnel created.
--
-- Everything here is idempotent: re-running leaves the same two cron jobs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- _expire_stale_booking_holds — unchanged, restated for clarity.
--   `booking_id is not null` is what keeps the 27 pre-existing legacy
--   `pending_payment` rows in prod (foreign learners, no booking_id) untouched.
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
-- _cleanup_stale_bookings — same behaviour as before EXCEPT the payment purge,
-- which is now scoped to the enrollments this janitor removes (see header).
-- The enrollment purge is additionally restricted to `status = 'pending'` so a
-- live/app-managed enrollment is never mistaken for funnel residue.
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
  --
  --    `on commit drop` keeps the table alive for the WHOLE transaction, so a
  --    second call in the same transaction would fail with 42P07 "relation
  --    already exists". Drop first (schema-qualified to pg_temp, so a same-named
  --    permanent table in public can never be dropped) to make this re-entrant.
  drop table if exists pg_temp._cleanup_targets;
  drop table if exists pg_temp._cleanup_payments;
  create temp table _cleanup_targets on commit drop as
    select id, learner_id, course_id
    from public.booking
    where status in ('conflict', 'abandoned')
      and coalesce(updated_at, created_at) < now() - make_interval(days => p_cleanup_days);

  -- Snapshot the payments attached to the enrollments we are about to remove.
  -- ONLY these may be deleted below. Captured before the delete so the
  -- "no linked enrollment" test cannot widen to the live app's payments.
  create temp table _cleanup_payments on commit drop as
    select distinct p.id, p.status
    from public.payment p
    where p.status = 'pending'
      and exists (
        select 1
        from public.enrollment en
        where en.payment_id = p.id
          and (en.learner_id, en.course_id) in (
            select t.learner_id, t.course_id from _cleanup_targets t
          )
      );

  delete from public."Schedule" s
  using _cleanup_targets t
  where s.booking_id = t.id;

  delete from public.booking b
  using _cleanup_targets t
  where b.id = t.id;
  get diagnostics v_purged_bookings = row_count;

  -- 4. Orphaned funnel rows: pending enrollments (and their add-ons) for the
  --    learner+course of a purged conflict/abandoned booking, holding no
  --    completed payment. Completed payments and live enrollments are never
  --    touched.
  delete from public.enrollment_addons ea
  where ea.enrollment_id in (
    select en.id
    from public.enrollment en
    where en.status = 'pending'
      and (en.payment_id is null or exists (
        select 1 from public.payment p where p.id = en.payment_id and p.status <> 'completed'
      ))
      and (en.learner_id, en.course_id) in (select t.learner_id, t.course_id from _cleanup_targets t)
  );

  delete from public.enrollment en
  where en.status = 'pending'
    and (en.payment_id is null or exists (
      select 1 from public.payment p where p.id = en.payment_id and p.status <> 'completed'
    ))
    and (en.learner_id, en.course_id) in (select t.learner_id, t.course_id from _cleanup_targets t);
  get diagnostics v_purged_enrollments = row_count;

  -- 5. Only the pending payments captured above (i.e. attached to the enrollments
  --    just deleted) are reclaimed. The previous unscoped version also deleted
  --    170 unrelated live-app rows on prod.
  delete from public.payment p
  using _cleanup_payments cp
  where p.id = cp.id
    and p.status = 'pending';
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

-- -----------------------------------------------------------------------------
-- Schedule both janitors.
--
--   booking-expire-holds    every 5 min — hold_minutes is 15 in prod, so a stale
--                           hold must be freed well before it blocks a customer.
--   booking-cleanup-stale  hourly, offset from the 7 existing live-app jobs.
--
-- `cron.schedule(jobname, ...)` upserts by name, but unschedule-then-schedule is
-- used so re-running the migration is deterministic on every pg_cron version.
-- Both functions are SECURITY DEFINER and the grant above is to service_role;
-- cron runs as the scheduling role (postgres), which retains execute.
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron;

do $cron$
declare
  v_expire text := 'booking-expire-holds';
  v_cleanup text := 'booking-cleanup-stale';
begin
  if exists (select 1 from cron.job where jobname = v_expire) then
    perform cron.unschedule(v_expire);
  end if;
  perform cron.schedule(
    v_expire,
    '*/5 * * * *',
    'select public._expire_stale_booking_holds(null)'
  );

  if exists (select 1 from cron.job where jobname = v_cleanup) then
    perform cron.unschedule(v_cleanup);
  end if;
  perform cron.schedule(
    v_cleanup,
    '17 * * * *',
    'select public._cleanup_stale_bookings(60, 7)'
  );
end;
$cron$;