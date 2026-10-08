-- RTO flow homepage states (customer-facing LL journey revamp):
--   * per-state homepage copy + CTAs driven by ll_applications.status
--   * status_changed_at powers the 24h/48h appointment reminders
--   * call_missed_count distinguishes 1st vs 2nd customer no-show
--   * ll_issue_date / ll_expiry_date back the "LL issued" card and the
--     30-days-before-expiry warning
--   * reapply_fee is the fresh government fee quoted when scrutiny expires
--   * reminders_sent tracks which scheduled nudges (ll-flow-reminders edge
--     function) have already gone out, so the daily sweep never double-sends
--   * new statuses: call_missed_by_lane (free reschedule + apology) and
--     scrutiny_expired (day-7 fallback, replaces the silent return to
--     meet_booking_enabled)

ALTER TABLE "public"."ll_applications"
  ADD COLUMN IF NOT EXISTS "status_changed_at" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "call_missed_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ll_issue_date" date,
  ADD COLUMN IF NOT EXISTS "ll_expiry_date" date,
  ADD COLUMN IF NOT EXISTS "reapply_fee" numeric,
  ADD COLUMN IF NOT EXISTS "reminders_sent" jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- DL-test phase (customer homepage states):
  --   * dl_preferred_date/rto — the customer's slot preference, entered on the
  --     homepage picker; ops confirms it into dl_test_date/dl_test_rto
  --   * dl_test_time + dl_test_rto_address — shown on the confirmed-test card
  --   * dl_retest_fee — quoted when the DL test is failed
  --   * dl_expiry_date — "Valid Till" on the issued-DL card
  --   * dl_dispatch_eta + dl_tracking_ref — DL card delivery tracking
  ADD COLUMN IF NOT EXISTS "dl_preferred_date" date,
  ADD COLUMN IF NOT EXISTS "dl_preferred_rto" text,
  ADD COLUMN IF NOT EXISTS "dl_test_time" text,
  ADD COLUMN IF NOT EXISTS "dl_test_rto_address" text,
  ADD COLUMN IF NOT EXISTS "dl_retest_fee" numeric,
  ADD COLUMN IF NOT EXISTS "dl_expiry_date" date,
  ADD COLUMN IF NOT EXISTS "dl_dispatch_eta" date,
  ADD COLUMN IF NOT EXISTS "dl_tracking_ref" text;

-- Existing rows: seed status_changed_at from updated_at so reminder timers
-- don't all restart from the migration moment.
UPDATE "public"."ll_applications"
SET "status_changed_at" = "updated_at"
WHERE "status_changed_at" > "updated_at";

-- Keep status_changed_at honest no matter which code path flips the status.
CREATE OR REPLACE FUNCTION public.ll_touch_status_changed_at() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS "trg_ll_touch_status_changed_at" ON "public"."ll_applications";
CREATE TRIGGER "trg_ll_touch_status_changed_at"
  BEFORE UPDATE ON "public"."ll_applications"
  FOR EACH ROW EXECUTE FUNCTION public.ll_touch_status_changed_at();

-- ── Scrutiny-expiry fallback now lands on a dedicated customer-facing
--    status instead of silently reopening meet booking. The homepage shows
--    "scrutiny expired — pay the fresh govt fee and reapply", and the daily
--    reminder sweep sends ll_scrutiny_expired_reapply once.
CREATE OR REPLACE FUNCTION public.ll_expire_scrutiny() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  moved integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT id, learner_id, status
    FROM public.ll_applications
    WHERE status = 'll_test_enabled'
      AND scrutiny_expiry_date IS NOT NULL
      AND scrutiny_expiry_date < CURRENT_DATE
  LOOP
    UPDATE public.ll_applications
    SET status = 'scrutiny_expired', updated_at = now()
    WHERE id = r.id;

    INSERT INTO public.ll_pipeline_events
      (application_id, learner_id, event_type, from_status, to_status, actor_name, note)
    VALUES
      (r.id, r.learner_id, 'status_change', r.status, 'scrutiny_expired',
       'System',
       'Scrutiny expired (7 days past Scrutiny Approved Date) — customer must pay a fresh govt fee and reapply');

    moved := moved + 1;
  END LOOP;
  RETURN moved;
END;
$fn$;
