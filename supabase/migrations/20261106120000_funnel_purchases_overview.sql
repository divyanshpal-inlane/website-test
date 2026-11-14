-- Website purchases merged into the normal Sales stream (final plan v2, 2026-11-06).
--
-- ADDITIVE ONLY. Not applied to prod yet: dry-run inside `begin ... rollback`
-- first, then log in DB_change.md (rule 0.1.3).
--
-- 1. get_funnel_purchases_overview()  -- read-only, admin-only. One row per paid
--    website purchase showing where it is in the NORMAL flow: onboarding done or
--    pending (Ops need both counts), whether the scheduling request has reached
--    New Schedules, the held plan vs the purchased lessons, and the RTO
--    application's pipeline stage. It replaces the ops_workstream-based
--    get_funnel_ops_requests for the Control Tower overview (that RPC and its
--    tables are frozen, not dropped).
-- 2. _cleanup_orphan_rto_enrollments() -- a website licence-only purchase now
--    opens an 'rto_only' licence-service enrollment (like Sales' "Licence service"
--    tab). _cleanup_stale_bookings deliberately skips rto_only, so an abandoned
--    purchase would leave an unpaid enrollment behind. This removes only
--    unpaid, funnel-created rto_only enrollments of abandoned bookings.

create or replace function public.get_funnel_purchases_overview()
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
        b.id as booking_id,
        b.created_at,
        b.status as booking_status,
        b.case_type,
        b.course_name,
        b.total_amount,
        l.id as learner_id,
        l.name as learner_name,
        l.phone as learner_phone,
        coalesce(l.onboarding_completed, false) as onboarding_completed,
        (l.signature_storage_path is not null) as signature_present,
        coalesce(l."has_a_DL", false) as has_a_dl,
        (select count(*) from storage.objects o
          where o.bucket_id = 'LL'
            and split_part(o.name, '/', 1) in (
              right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10),
              '91' || right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10),
              '+91' || right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10)
            )) as licence_files,
        exists (select 1 from reschedule_requests rr
                where rr.learner_id = b.learner_id and rr.type = 'new' and rr.status = 'pending') as request_pending,
        exists (select 1 from reschedule_requests rr
                where rr.learner_id = b.learner_id and rr.type = 'new' and rr.status = 'completed') as request_completed,
        (select count(*) from "Schedule" s where s.booking_id = b.id and s.status = 'tentative') as held_lessons,
        (select count(*) from "Schedule" s where s.booking_id = b.id and s.status = 'booked') as booked_lessons,
        (select c.total_lessons from "Courses" c where c.id = b.course_id) as total_lessons,
        (select la.status from ll_applications la
          where la.learner_id = b.learner_id
            and la.acquired_via_funnel = true
            and la.status not in ('dl_delivered', 'closed')
          order by la.created_at desc limit 1) as ll_status,
        (select la.services from ll_applications la
          where la.learner_id = b.learner_id
            and la.acquired_via_funnel = true
            and la.status not in ('dl_delivered', 'closed')
          order by la.created_at desc limit 1) as ll_services,
        exists (select 1 from enrollment e
                where e.learner_id = b.learner_id
                  and e.acquired_via_funnel = true
                  and e.licence_resubmission_requested_at is not null) as licence_resubmission_requested
      from booking b
      left join "Learner" l on l.id = b.learner_id
      where b.status in ('payment_completed', 'confirmed')
      order by b.created_at desc
      limit 500
    ) r
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_funnel_purchases_overview() from public, anon;
grant execute on function public.get_funnel_purchases_overview() to authenticated;

-- 2. Orphan licence-service enrollments of abandoned website purchases.
create or replace function public._cleanup_orphan_rto_enrollments(p_age_days integer default 1)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.enrollment en
  where en.case_type = 'rto_only'
    and en.acquired_via_funnel = true
    and en.payment_id is null
    and en.status = 'pending'
    and en.created_at < now() - make_interval(days => p_age_days)
    and not exists (
      select 1 from public.booking b
      where b.learner_id = en.learner_id
        and b.case_type = 'rto_only'
        and b.status in ('created', 'payment_completed', 'confirmed')
    );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public._cleanup_orphan_rto_enrollments(integer) from public, anon, authenticated;

-- Hourly at :27 (the booking janitor runs at :17).
select cron.schedule(
  'booking-cleanup-rto-enrollments',
  '27 * * * *',
  $cron$select public._cleanup_orphan_rto_enrollments(1)$cron$
);
