-- Capture structured car-buying intent on the learner (the "car commerce" lead
-- signal collected by instructors after lessons). Complements the onboarding
-- columns added in 20260611_add_car_commerce_to_learner.sql
-- (driving_motivation, car_purchase_timeline).
--
-- NOTE: distinct from the existing car_make/car_mode/car_number/... columns,
-- which describe the learner's CURRENT/owned car — these capture a car they
-- intend to BUY.
ALTER TABLE "public"."Learner"
ADD COLUMN IF NOT EXISTS "car_intent_planning" TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "car_intent_type" TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "car_intent_condition" TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "car_intent_timeframe" TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "car_intent_source" TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "car_intent_updated_at" TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN "public"."Learner"."car_intent_planning" IS 'Is the learner planning to buy a car? (Yes/No) — captured by instructor feedback';
COMMENT ON COLUMN "public"."Learner"."car_intent_type" IS 'Intended car type (Hatchback / Sedan / SUV)';
COMMENT ON COLUMN "public"."Learner"."car_intent_condition" IS 'Intended car condition (New / Used)';
COMMENT ON COLUMN "public"."Learner"."car_intent_timeframe" IS 'When the learner intends to buy (0-3 Months … 1+ Year / Not Sure)';
COMMENT ON COLUMN "public"."Learner"."car_intent_source" IS 'Where the latest car-intent signal came from (e.g. instructor_feedback)';
COMMENT ON COLUMN "public"."Learner"."car_intent_updated_at" IS 'When the car-intent fields were last updated';
