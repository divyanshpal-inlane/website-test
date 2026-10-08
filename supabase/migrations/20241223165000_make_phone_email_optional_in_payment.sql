-- Make phone and email fields optional in payment table
ALTER TABLE payment
ALTER COLUMN phone DROP NOT NULL,
ALTER COLUMN email DROP NOT NULL;

-- Drop existing policies
DROP POLICY IF EXISTS "Enable read access for users based on user_id" ON "public"."payment";
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON "public"."payment";

-- Create new policies using learner's phone for authentication
CREATE POLICY "Enable read access for users based on learner phone" ON "public"."payment"
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "Learner"
            WHERE "Learner".id = payment.learner_id
            AND "Learner".phone = auth.jwt()->>'phone'
        )
    );

CREATE POLICY "Enable insert for users based on learner phone" ON "public"."payment"
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "Learner"
            WHERE "Learner".id = payment.learner_id
            AND "Learner".phone = auth.jwt()->>'phone'
        )
    );

-- Ensure indexes are properly set
CREATE INDEX IF NOT EXISTS payment_learner_id_idx ON payment(learner_id);
CREATE INDEX IF NOT EXISTS payment_status_idx ON payment(status); 