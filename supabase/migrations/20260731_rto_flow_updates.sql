-- RTO Flow update (WAI-75): native in-app LL application form + document
-- review, plus the admin-panel feedback items from LL-DL_Flow_Feedback:
--   * customer form answers + uploaded documents stored in-app (no Google Form)
--   * date_of_birth on the application (item 2)
--   * ll_test_date renamed to scrutiny_approved_date (item 3)
--   * scrutiny_expiry_date auto-derived as approval + 7 calendar days (item 4)
--   * daily auto-fallback to meet_booking_enabled when scrutiny expires (item 5)
--   * DL test application number/date (item 6)

-- ── ll_applications: renamed + new fields ────────────────────────────────
ALTER TABLE "public"."ll_applications"
  RENAME COLUMN "ll_test_date" TO "scrutiny_approved_date";

ALTER TABLE "public"."ll_applications"
  ADD COLUMN IF NOT EXISTS "date_of_birth" date,
  -- Calendar days, per LL-DL_Flow_Feedback item 4 (pending ops confirmation
  -- on working-days handling). Generated => never manually editable.
  ADD COLUMN IF NOT EXISTS "scrutiny_expiry_date" date
    GENERATED ALWAYS AS ("scrutiny_approved_date" + 7) STORED,
  ADD COLUMN IF NOT EXISTS "dl_application_number" text,
  ADD COLUMN IF NOT EXISTS "dl_application_date" date,
  -- Answers from the in-app LL application form (replaces the Google Form).
  ADD COLUMN IF NOT EXISTS "form_data" jsonb,
  ADD COLUMN IF NOT EXISTS "form_submitted_at" timestamptz;

-- ── Uploaded documents (photo, signature, age/address/ID proof…) ─────────
CREATE TABLE IF NOT EXISTS "public"."ll_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "application_id" uuid NOT NULL REFERENCES "public"."ll_applications" ("id") ON DELETE CASCADE,
  "learner_id" uuid REFERENCES "public"."Learner" ("id") ON DELETE CASCADE,
  -- photo | signature | age_proof | address_proof | id_proof | affidavit
  "doc_type" text NOT NULL,
  -- Which specific proof was uploaded (e.g. "aadhaar", "voter_id", "passport").
  "doc_subtype" text,
  -- Path inside the ll-documents storage bucket.
  "storage_path" text NOT NULL,
  "file_name" text,
  "mime_type" text,
  -- pending | approved | rejected  (reviewed by the RTO team in LL Pipeline)
  "status" text NOT NULL DEFAULT 'pending',
  "rejection_reason" text,
  "reviewed_by" text,
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ll_documents_application"
  ON "public"."ll_documents" ("application_id", "created_at" DESC);

ALTER TABLE "public"."ll_documents" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ll_documents_select" ON "public"."ll_documents"
  FOR SELECT USING (true);
CREATE POLICY "ll_documents_insert" ON "public"."ll_documents"
  FOR INSERT WITH CHECK (true);
CREATE POLICY "ll_documents_update" ON "public"."ll_documents"
  FOR UPDATE USING (true);
-- Re-uploading a document replaces the previous row of the same doc_type.
CREATE POLICY "ll_documents_delete" ON "public"."ll_documents"
  FOR DELETE USING (true);

-- ── Storage bucket (same open-policy pattern as bug-screenshots) ─────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('ll-documents', 'll-documents', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow public uploads to ll-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow public viewing of ll-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates to ll-documents" ON storage.objects;

CREATE POLICY "Allow public uploads to ll-documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'll-documents');
CREATE POLICY "Allow public viewing of ll-documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'll-documents');
CREATE POLICY "Allow public updates to ll-documents" ON storage.objects
  FOR UPDATE USING (bucket_id = 'll-documents');

-- ── Scrutiny-expiry auto-fallback (feedback item 5) ──────────────────────
-- Applications whose scrutiny approval is > 7 days old and that have not
-- progressed past "LL Test Enabled" are returned to the meeting-enabled
-- stage so the process can restart, with a System event on the timeline.
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
    SET status = 'meet_booking_enabled', updated_at = now()
    WHERE id = r.id;

    INSERT INTO public.ll_pipeline_events
      (application_id, learner_id, event_type, from_status, to_status, actor_name, note)
    VALUES
      (r.id, r.learner_id, 'status_change', r.status, 'meet_booking_enabled',
       'System',
       'Scrutiny expired (7 days past Scrutiny Approved Date) — auto-returned to Meet Booking');

    moved := moved + 1;
  END LOOP;
  RETURN moved;
END;
$fn$;

-- Schedule daily at 21:30 UTC (03:00 IST). Guarded so the migration still
-- applies on environments without pg_cron (run ll_expire_scrutiny() manually
-- or schedule it another way there).
DO $do$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron unavailable: %', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'll-expire-scrutiny',
      '30 21 * * *',
      'SELECT public.ll_expire_scrutiny()'
    );
  END IF;
END;
$do$;
