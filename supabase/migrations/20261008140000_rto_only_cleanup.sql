-- =============================================================================
-- Cleanup for abandoned rto_only bookings.
-- These bookings have no Schedule rows (no holds), so they don't get cleaned
-- by the existing janitors. This extends _cleanup_stale_bookings to handle them.
-- =============================================================================

-- Update _cleanup_stale_bookings to also handle rto_only bookings
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
  v_rto_only_abandoned integer := 0;
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

  -- 2a. Mark stale unpaid (created) bookings abandoned and cancel their holds (non-rto_only).
  update public."Schedule" s
  set status = 'cancelled'
  from public.booking b
  where b.id = s.booking_id
    and s.status = 'pending_payment'
    and b.status = 'created'
    and b.case_type <> 'rto_only'
    and b.created_at < now() - make_interval(mins => v_hold_minutes + p_hold_grace_minutes);
  get diagnostics v_row_count = row_count;
  v_expired_holds := v_expired_holds + v_row_count;

  update public.booking
  set status = 'abandoned'
  where status = 'created'
    and case_type <> 'rto_only'
    and created_at < now() - make_interval(mins => v_hold_minutes + p_hold_grace_minutes);
  get diagnostics v_abandoned = row_count;

  -- 2b. Mark stale rto_only bookings abandoned (no holds to cancel).
  update public.booking
  set status = 'abandoned'
  where status = 'created'
    and case_type = 'rto_only'
    and created_at < now() - make_interval(mins => v_hold_minutes + p_hold_grace_minutes);
  get diagnostics v_rto_only_abandoned = row_count;

  -- 3. Snapshot the purge set BEFORE deleting anything (old conflict/abandoned
  --    bookings), so the enrollment/payment cleanup below stays scoped to the
  --    booking flow and never touches legacy rows. Temp table dies with the
  --    transaction.
  create temp table _cleanup_targets on commit drop as
    select id, learner_id, course_id, case_type
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

  -- 4. Orphaned money rows for course bookings (non-rto_only):
  --    enrollments (and their addons) whose learner+course was only ever
  --    represented by a conflict/abandoned booking and that hold no completed payment.
  delete from public.enrollment_addons ea
  where ea.enrollment_id in (
    select en.id
    from public.enrollment en
    where (en.payment_id is null or exists (
      select 1 from public.payment p where p.id = en.payment_id and p.status <> 'completed'
    ))
      and (en.learner_id, en.course_id) in (
        select t.learner_id, t.course_id from _cleanup_targets t where t.case_type <> 'rto_only'
      )
  );

  delete from public.enrollment en
  where (en.payment_id is null or exists (
    select 1 from public.payment p where p.id = en.payment_id and p.status <> 'completed'
  ))
    and (en.learner_id, en.course_id) in (
      select t.learner_id, t.course_id from _cleanup_targets t where t.case_type <> 'rto_only'
    );
  get diagnostics v_purged_enrollments = row_count;

  -- 5. Orphaned payments for rto_only bookings: payments with no enrollment link
  --    and associated with abandoned rto_only bookings.
  delete from public.payment p
  where p.status = 'pending'
    and p.gateway = 'razorpay'
    and not exists (
      select 1 from public.enrollment en where en.payment_id = p.id
    )
    and exists (
      select 1 from public.booking b
      where b.id = (select booking_id from public.payment p2 where p2.id = p.id)
        and b.case_type = 'rto_only'
        and b.status = 'abandoned'
    )
    and p.created_at < now() - make_interval(days => p_cleanup_days);

  -- 6. General orphaned pending razorpay payments with no enrollment (legacy safety).
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
    'rto_only_abandoned', v_rto_only_abandoned,
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