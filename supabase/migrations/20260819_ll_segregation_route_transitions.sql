-- Segregation routes A–D (stored in ll_applications.batch_code) drive which
-- RTO pipeline stages are legal. Mirrors src/constants/llPipeline.ts
-- getLLAdvanceTargets / getLLFailureOptions / recover edges.
--
-- Legacy LN* batch codes are cleared; ops must re-select A–D before advancing
-- from application_ready.

-- ── batch_code must be A–D or NULL ───────────────────────────────────────
UPDATE public.ll_applications
SET batch_code = NULL
WHERE batch_code IS NOT NULL
  AND batch_code NOT IN ('A', 'B', 'C', 'D');

ALTER TABLE public.ll_applications
  DROP CONSTRAINT IF EXISTS ll_applications_batch_code_check;

ALTER TABLE public.ll_applications
  ADD CONSTRAINT ll_applications_batch_code_check
  CHECK (batch_code IS NULL OR batch_code IN ('A', 'B', 'C', 'D'));

COMMENT ON COLUMN public.ll_applications.batch_code IS
  'Segregation route A|B|C|D (Out of state / Aadhaar fast track / Add-on matched / Add-on mismatch)';

-- ── Allowed happy-path next statuses for a route ─────────────────────────
CREATE OR REPLACE FUNCTION public.ll_advance_targets(
  p_status text,
  p_batch_code text
) RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_status = 'application_ready' THEN
    IF p_batch_code IS NULL OR p_batch_code NOT IN ('A', 'B', 'C', 'D') THEN
      RETURN ARRAY[]::text[];
    END IF;
    CASE p_batch_code
      WHEN 'A' THEN RETURN ARRAY['in_scrutiny_queue'];
      WHEN 'B' THEN RETURN ARRAY['ll_test_enabled', 'in_scrutiny_queue'];
      WHEN 'C' THEN RETURN ARRAY['ll_approval_pending'];
      WHEN 'D' THEN RETURN ARRAY['in_scrutiny_queue'];
    END CASE;
  END IF;

  IF p_status = 'waiting_rto_verification' THEN
    IF p_batch_code IN ('C', 'D') THEN
      RETURN ARRAY['ll_approval_pending'];
    END IF;
    RETURN ARRAY['ll_test_enabled'];
  END IF;

  IF p_status IN ('ll_test_enabled', 'll_test_passed')
     AND p_batch_code IN ('C', 'D') THEN
    RETURN ARRAY['ll_approval_pending'];
  END IF;

  RETURN CASE p_status
    WHEN 'payment_received' THEN ARRAY['docs_link_sent']
    WHEN 'docs_link_sent' THEN ARRAY['docs_submitted']
    WHEN 'docs_submitted' THEN ARRAY['docs_under_review']
    WHEN 'docs_under_review' THEN ARRAY['meet_booking_enabled']
    WHEN 'meet_booking_enabled' THEN ARRAY['appointment_booked']
    WHEN 'appointment_booked' THEN ARRAY['rto_application_generated']
    WHEN 'rto_application_generated' THEN ARRAY['govt_payment_pending']
    WHEN 'govt_payment_pending' THEN ARRAY['application_ready']
    WHEN 'in_scrutiny_queue' THEN ARRAY['assigned_to_runner']
    WHEN 'assigned_to_runner' THEN ARRAY['submitted_at_rto']
    WHEN 'submitted_at_rto' THEN ARRAY['waiting_rto_verification']
    WHEN 'll_test_enabled' THEN ARRAY['ll_test_passed']
    WHEN 'll_test_passed' THEN ARRAY['ll_approval_pending']
    WHEN 'll_approval_pending' THEN ARRAY['ll_issued']
    WHEN 'll_issued' THEN ARRAY['ob_form_enabled', 'll_maturing']
    WHEN 'ob_form_enabled' THEN ARRAY['classes_in_progress']
    WHEN 'classes_in_progress' THEN ARRAY['dl_date_selection']
    WHEN 'll_maturing' THEN ARRAY['ll_matured']
    WHEN 'll_matured' THEN ARRAY['dl_date_selection']
    WHEN 'dl_date_selection' THEN ARRAY['dl_date_preference_received']
    WHEN 'dl_date_preference_received' THEN ARRAY['dl_test_scheduled', 'dl_otp_required']
    WHEN 'dl_otp_required' THEN ARRAY['dl_test_scheduled']
    WHEN 'dl_test_scheduled' THEN ARRAY['dl_results_pending']
    WHEN 'dl_results_pending' THEN ARRAY['dl_test_passed']
    WHEN 'dl_test_passed' THEN ARRAY['dl_number_generated']
    WHEN 'dl_number_generated' THEN ARRAY['dl_delivery_pending']
    WHEN 'dl_delivery_pending' THEN ARRAY['dl_delivered']
    ELSE ARRAY[]::text[]
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.ll_failure_targets(
  p_status text,
  p_batch_code text
) RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  targets text[] := ARRAY[]::text[];
BEGIN
  CASE p_status
    WHEN 'docs_under_review' THEN
      targets := ARRAY['docs_rejected'];
    WHEN 'appointment_booked' THEN
      targets := ARRAY['call_missed', 'call_missed_by_lane'];
    WHEN 'govt_payment_pending' THEN
      targets := ARRAY['govt_payment_failed'];
    WHEN 'waiting_rto_verification' THEN
      IF p_batch_code IS DISTINCT FROM 'C' THEN
        targets := ARRAY['scrutiny_rejected'];
      END IF;
    WHEN 'll_test_enabled' THEN
      IF p_batch_code IS NULL OR p_batch_code IN ('A', 'B') THEN
        targets := ARRAY['ll_test_failed', 'scrutiny_expired'];
      END IF;
    WHEN 'll_approval_pending' THEN
      targets := ARRAY['ll_approval_rejected'];
    WHEN 'dl_test_scheduled' THEN
      targets := ARRAY['dl_test_missed'];
    WHEN 'dl_results_pending' THEN
      targets := ARRAY['dl_test_failed'];
    WHEN 'dl_delivery_pending' THEN
      targets := ARRAY['dl_not_delivered'];
    ELSE
      targets := ARRAY[]::text[];
  END CASE;
  RETURN targets;
END;
$$;

CREATE OR REPLACE FUNCTION public.ll_recover_target(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'docs_rejected' THEN 'docs_submitted'
    WHEN 'call_missed' THEN 'appointment_booked'
    WHEN 'call_missed_by_lane' THEN 'appointment_booked'
    WHEN 'govt_payment_failed' THEN 'govt_payment_pending'
    WHEN 'scrutiny_rejected' THEN 'submitted_at_rto'
    WHEN 'll_test_failed' THEN 'll_test_enabled'
    WHEN 'scrutiny_expired' THEN 'meet_booking_enabled'
    WHEN 'll_approval_rejected' THEN 'meet_booking_enabled'
    WHEN 'dl_test_missed' THEN 'dl_test_scheduled'
    WHEN 'dl_test_failed' THEN 'dl_test_scheduled'
    WHEN 'dl_not_delivered' THEN 'dl_delivery_pending'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.ll_is_allowed_status_transition(
  p_from text,
  p_to text,
  p_batch_code text
) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_from IS NOT DISTINCT FROM p_to THEN
    RETURN false;
  END IF;

  IF p_from = 'll_test_enabled' AND p_to IN ('meet_booking_enabled', 'scrutiny_expired') THEN
    RETURN true;
  END IF;
  IF p_from = 'scrutiny_expired' AND p_to = 'meet_booking_enabled' THEN
    RETURN true;
  END IF;

  IF public.ll_recover_target(p_from) = p_to THEN
    RETURN true;
  END IF;

  IF p_to = ANY (public.ll_failure_targets(p_from, p_batch_code)) THEN
    RETURN true;
  END IF;

  IF p_to = ANY (public.ll_advance_targets(p_from, p_batch_code)) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ll_enforce_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  kind text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  kind := nullif(current_setting('ll.transition_kind', true), '');
  IF kind = 'revert' THEN
    RETURN NEW;
  END IF;

  IF NOT public.ll_is_allowed_status_transition(
    OLD.status,
    NEW.status,
    COALESCE(NEW.batch_code, OLD.batch_code)
  ) THEN
    RAISE EXCEPTION
      'Illegal LL status transition % → % for route %',
      OLD.status, NEW.status, COALESCE(NEW.batch_code, OLD.batch_code, 'unset')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ll_enforce_status_transition ON public.ll_applications;
CREATE TRIGGER trg_ll_enforce_status_transition
  BEFORE UPDATE OF status ON public.ll_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.ll_enforce_status_transition();

-- Ops stage revert — sets ll.transition_kind so the enforce trigger allows it.
CREATE OR REPLACE FUNCTION public.ll_revert_application(
  p_application_id uuid,
  p_to_status text,
  p_clear_fields jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cols text;
  sql text;
  allowed_clear text[] := ARRAY[
    'application_number','application_date','batch_code','scrutiny_approved_date',
    'll_number','ll_issue_date','ll_expiry_date','ll_type','ll_matures_at',
    'dl_preferred_date','dl_preferred_rto','dl_application_number','dl_application_date',
    'dl_test_date','dl_test_time','dl_test_rto','dl_test_rto_address',
    'dl_number','dl_expiry_date','dl_dispatch_eta','dl_tracking_ref'
  ];
BEGIN
  PERFORM set_config('ll.transition_kind', 'revert', true);

  sql := 'UPDATE public.ll_applications SET status = $1, updated_at = now()';
  IF p_clear_fields IS NOT NULL AND p_clear_fields <> '{}'::jsonb THEN
    SELECT string_agg(format('%I = NULL', key), ', ')
    INTO cols
    FROM jsonb_object_keys(p_clear_fields) AS key
    WHERE key = ANY (allowed_clear);
    IF cols IS NOT NULL AND cols <> '' THEN
      sql := sql || ', ' || cols;
    END IF;
  END IF;
  sql := sql || ' WHERE id = $2';

  EXECUTE sql USING p_to_status, p_application_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ll_revert_application(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ll_revert_application(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ll_revert_application(uuid, text, jsonb) TO anon;
