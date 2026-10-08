-- Capture car-commerce intent during onboarding (replaces the Aadhar question).
-- Collected on the "After you learn to drive" screen.
ALTER TABLE "public"."Learner"
ADD COLUMN IF NOT EXISTS "driving_motivation" TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "car_purchase_timeline" TEXT DEFAULT NULL;

COMMENT ON COLUMN "public"."Learner"."driving_motivation" IS 'Q1: the first thing the learner wants to do once they can drive (e.g. buy own car / family drive / no more autos & cabs)';
COMMENT ON COLUMN "public"."Learner"."car_purchase_timeline" IS 'Q2: when the learner sees themselves buying a car (within 1 month / 1-6 months / later or undecided)';
