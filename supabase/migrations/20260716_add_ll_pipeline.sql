-- End-to-end LL -> DL application pipeline (from the Ops flow board).
-- One row per RTO application journey, driven by a status state machine
-- defined in src/constants/llPipeline.ts. Every status change / field edit
-- appends a row to ll_pipeline_events (timeline + audit log), mirroring the
-- append-only pattern of enrollment_plan_audit.

CREATE TABLE IF NOT EXISTS "public"."ll_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "learner_id" uuid NOT NULL REFERENCES "public"."Learner" ("id") ON DELETE CASCADE,

  -- Current stage key from src/constants/llPipeline.ts (e.g. "docs_under_review").
  "status" text NOT NULL DEFAULT 'payment_received',

  -- Services ticked on the RTO application call:
  -- ["ll","classes","dl","dl_renewal","address_change_ka","name_correction",
  --  "backlog","duplicate_dl","idp","dl_address_change_other_state"]
  "services" jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Post-LL branch: "with_classes" (OB form + classes) or "direct_dl"
  -- (1-month LL maturing timer). Null until the branch decision.
  "ll_type" text,

  -- Ops data-entry fields (filled as the journey progresses)
  "application_number" text,
  "application_date" date,
  "batch_code" text,            -- segregation route A|B|C|D (was LN001-007 style)
  "ll_number" text,
  "ll_test_date" date,
  "ll_matures_at" date,         -- ll_issued + 1 month for direct_dl branch
  "dl_test_date" date,
  "dl_test_rto" text,
  "dl_number" text,
  "rejection_reason" text,      -- latest scrutiny / approval rejection reason

  -- Escalation flag: set automatically on repeated misses/timeouts or
  -- manually by Ops; surfaced in the "Escalations" queue.
  "escalated" boolean NOT NULL DEFAULT false,
  "escalation_reason" text,

  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- One active journey per learner at a time (history stays queryable via events).
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ll_applications_learner_active"
  ON "public"."ll_applications" ("learner_id")
  WHERE "status" NOT IN ('dl_delivered', 'closed');

CREATE INDEX IF NOT EXISTS "idx_ll_applications_status"
  ON "public"."ll_applications" ("status");
CREATE INDEX IF NOT EXISTS "idx_ll_applications_escalated"
  ON "public"."ll_applications" ("escalated") WHERE "escalated";

CREATE TABLE IF NOT EXISTS "public"."ll_pipeline_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "application_id" uuid NOT NULL REFERENCES "public"."ll_applications" ("id") ON DELETE CASCADE,
  "learner_id" uuid REFERENCES "public"."Learner" ("id") ON DELETE CASCADE,
  "event_type" text NOT NULL DEFAULT 'status_change', -- status_change | field_update | note | escalation
  "from_status" text,
  "to_status" text,
  -- Snapshot of who acted, kept as text so history survives user deletion.
  "actor_name" text,
  "note" text,
  -- For field_update events: [{ field, label, old, new }]
  "changes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ll_pipeline_events_application"
  ON "public"."ll_pipeline_events" ("application_id", "created_at" DESC);

ALTER TABLE "public"."ll_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ll_pipeline_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ll_applications_select" ON "public"."ll_applications"
  FOR SELECT USING (true);
CREATE POLICY "ll_applications_insert" ON "public"."ll_applications"
  FOR INSERT WITH CHECK (true);
CREATE POLICY "ll_applications_update" ON "public"."ll_applications"
  FOR UPDATE USING (true);

-- Events are append-only: insert + select, no update/delete policies.
CREATE POLICY "ll_pipeline_events_insert" ON "public"."ll_pipeline_events"
  FOR INSERT WITH CHECK (true);
CREATE POLICY "ll_pipeline_events_select" ON "public"."ll_pipeline_events"
  FOR SELECT USING (true);
