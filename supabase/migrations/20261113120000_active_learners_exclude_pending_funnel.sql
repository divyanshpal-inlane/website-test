-- Ops decision (2026-11-13): a website/funnel class booking is not an
-- "Active Learner" until Ops approves it in Website bookings. Today
-- get_active_learners_paginated() includes a learner the moment ANY of
-- three things is true: enrollment.status='active', any non-cancelled
-- Schedule row (which already includes 'tentative'), or a completed
-- payment. A funnel booking satisfies the first and third immediately on
-- payment, and the second as soon as its plan is held - all BEFORE Ops
-- ever sees it in Website bookings.
--
-- This migration changes ONLY the "tentative" piece here (the Approve-time
-- enrollment.status flip is a separate, edge-function-side change in
-- approve-booking-payment / review-booking):
--   1. 'tentative' no longer counts toward schedule_stats.live_count.
--      'tentative' is a status ONLY the funnel/direct-booking system ever
--      writes (see _shared/queries.ts / schedule-status.ts); no Sales flow
--      sets it, so this is a zero-risk, narrowly-scoped change for every
--      other learner.
--   2. A learner whose ONLY qualifying signal is a completed payment tied
--      to a funnel booking that still has a held (tentative) plan is
--      excluded too, so the payment-alone path can't surface them early
--      either. A learner with ANY other qualifying signal (a real active
--      enrollment, a real non-tentative schedule row, or a payment not
--      tied to such a booking) is unaffected.
--   3. Additive: returns enrollment.acquired_via_funnel so the admin UI can
--      show a small "Website" badge - no behaviour change, just a new column.
--
-- Dry-run in begin...rollback first; log in DB_change.md per project rule.

DROP FUNCTION IF EXISTS public.get_active_learners_paginated(integer, integer, text, uuid, text);

CREATE OR REPLACE FUNCTION public.get_active_learners_paginated(page_offset integer DEFAULT 0, page_size integer DEFAULT 20, search_term text DEFAULT NULL::text, instructor_filter uuid DEFAULT NULL::uuid, tab_filter text DEFAULT 'active'::text)
 RETURNS TABLE(id uuid, name text, email text, phone text, created_at timestamp with time zone, area text, pick_up_location text, address_lat numeric, address_lng numeric, preferred_start_date date, preferred_completion_days integer, prefers_two_hour_classes boolean, two_hour_days text, dl_test_date date, is_demo boolean, total_lessons integer, completed_count integer, has_topup_pending boolean, instructor_ids uuid[], acquired_via_funnel boolean, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_phone_digits text;
BEGIN
  IF get_active_learners_paginated.search_term ~ '^[+0-9()\s.-]+$' THEN
    v_phone_digits := regexp_replace(
      get_active_learners_paginated.search_term, '\D', '', 'g');
    IF length(v_phone_digits) > 10 AND left(v_phone_digits, 2) = '91' THEN
      v_phone_digits := right(v_phone_digits, 10);
    END IF;
    IF length(v_phone_digits) < 4 THEN
      v_phone_digits := NULL;
    END IF;
  END IF;

  RETURN QUERY
  WITH enrollment_stats AS (
    SELECT
      e.learner_id,
      BOOL_OR((e.progress->>'type') = 'demo') AS is_demo,
      MAX(
        COALESCE(
          c.total_lessons,
          c.duration,
          (e.progress->>'total_hours')::INT,
          10
        )
      )::INT AS total_lessons,
      BOOL_OR(e.acquired_via_funnel) AS acquired_via_funnel
    FROM "enrollment" e
    LEFT JOIN "Courses" c ON e.course_id = c.id
    WHERE e.status = 'active'
    GROUP BY e.learner_id
  ),
  schedule_stats AS (
    SELECT
      s.learner_id,
      COUNT(CASE WHEN s.status = 'completed' THEN 1 END)::INT AS completed_count,
      -- 'tentative' is a held, not-yet-approved funnel plan - not a live
      -- lesson yet (see the module comment above).
      COUNT(CASE WHEN s.status NOT IN ('cancelled', 'tentative') THEN 1 END)::INT AS live_count,
      BOOL_OR(s.status = 'pending_payment') AS has_topup_pending,
      ARRAY_AGG(DISTINCT s.instructor_id)
        FILTER (WHERE s.instructor_id IS NOT NULL) AS instructor_ids
    FROM "Schedule" s
    GROUP BY s.learner_id
  ),
  -- Learners who paid, but whose ONLY paid relationship right now is a
  -- funnel booking still awaiting Website-bookings approval (a held,
  -- 'tentative' plan on a 'pending' funnel enrollment). Excluded from
  -- paid_learners below; a learner with any OTHER payment is unaffected.
  pending_funnel_payments AS (
    SELECT DISTINCT e.payment_id
    FROM "enrollment" e
    WHERE e.acquired_via_funnel = true
      AND e.status = 'pending'
      AND e.payment_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "Schedule" s
        WHERE s.learner_id = e.learner_id AND s.status = 'tentative'
      )
  ),
  paid_learners AS (
    SELECT DISTINCT p.learner_id
    FROM "payment" p
    WHERE p.status = 'completed'
      AND COALESCE(p.payment_type, 'course') <> 'reschedule'
      AND COALESCE(p.amount, 0) > 0
      AND p.id NOT IN (SELECT payment_id FROM pending_funnel_payments)
  ),
  learner_stats AS (
    SELECT
      l.id,
      l.name,
      l.email,
      l.phone,
      l.created_at,
      l.area,
      l.pick_up_location,
      l.address_lat,
      l.address_lng,
      l.preferred_start_date,
      l.preferred_completion_days,
      l.prefers_two_hour_classes,
      l.two_hour_days,
      l."DL_test_date",
      COALESCE(e.is_demo, false) AS is_demo,
      COALESCE(e.total_lessons, GREATEST(COALESCE(s.live_count, 0), 1)) AS total_lessons,
      COALESCE(s.completed_count, 0) AS completed_count,
      COALESCE(s.has_topup_pending, false) AS has_topup_pending,
      COALESCE(s.instructor_ids, ARRAY[]::UUID[]) AS instructor_ids,
      COALESCE(e.acquired_via_funnel, false) AS acquired_via_funnel
    FROM "Learner" l
    LEFT JOIN enrollment_stats e ON l.id = e.learner_id
    LEFT JOIN schedule_stats s ON l.id = s.learner_id
    LEFT JOIN paid_learners pl ON l.id = pl.learner_id
    WHERE
      (
        e.learner_id IS NOT NULL
        OR COALESCE(s.live_count, 0) > 0
        OR pl.learner_id IS NOT NULL
      )
      AND (
        get_active_learners_paginated.search_term IS NULL
        OR l.name ILIKE '%' || get_active_learners_paginated.search_term || '%'
        OR l.email ILIKE '%' || get_active_learners_paginated.search_term || '%'
        OR l.phone LIKE '%' || get_active_learners_paginated.search_term || '%'
        OR (
          v_phone_digits IS NOT NULL
          AND regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g')
                LIKE '%' || v_phone_digits || '%'
        )
      )
  ),
  filtered_learners AS (
    SELECT ls.*
    FROM learner_stats ls
    WHERE
      (
        get_active_learners_paginated.instructor_filter IS NULL
        OR get_active_learners_paginated.instructor_filter = ANY(ls.instructor_ids)
      )
      AND (
        get_active_learners_paginated.tab_filter = 'all'
        OR (get_active_learners_paginated.tab_filter = 'active' AND ls.completed_count < ls.total_lessons)
        OR (get_active_learners_paginated.tab_filter = 'completed' AND ls.completed_count >= ls.total_lessons)
      )
  ),
  total_metadata AS (
    SELECT COUNT(*)::BIGINT AS total
    FROM filtered_learners
  )
  SELECT
    fl.id,
    fl.name,
    fl.email,
    fl.phone,
    fl.created_at,
    fl.area,
    fl.pick_up_location,
    fl.address_lat,
    fl.address_lng,
    fl.preferred_start_date,
    fl.preferred_completion_days,
    fl.prefers_two_hour_classes,
    fl.two_hour_days,
    fl."DL_test_date",
    fl.is_demo,
    fl.total_lessons,
    fl.completed_count,
    fl.has_topup_pending,
    fl.instructor_ids,
    fl.acquired_via_funnel,
    (SELECT total FROM total_metadata) AS total_count
  FROM filtered_learners fl
  ORDER BY fl.created_at DESC
  LIMIT get_active_learners_paginated.page_size
  OFFSET get_active_learners_paginated.page_offset;
END;
$function$;
