-- Update RLS policies to use Learner table for authorization
DROP POLICY IF EXISTS "Users can view their own preferences" ON schedule_preferences;
DROP POLICY IF EXISTS "Users can insert their own preferences" ON schedule_preferences;
DROP POLICY IF EXISTS "Users can update their own preferences" ON schedule_preferences;
DROP POLICY IF EXISTS "Users can delete their own preferences" ON schedule_preferences;
DROP POLICY IF EXISTS "Admins can view all preferences" ON schedule_preferences;
DROP POLICY IF EXISTS "Admins can manage all preferences" ON schedule_preferences;

-- First, drop existing foreign key constraint
ALTER TABLE schedule_preferences DROP CONSTRAINT IF EXISTS schedule_preferences_learner_id_fkey;

-- Update the learner_id column to reference Learner table
ALTER TABLE schedule_preferences
  ALTER COLUMN learner_id TYPE uuid USING learner_id::uuid,
  ADD CONSTRAINT schedule_preferences_learner_id_fkey 
  FOREIGN KEY (learner_id) 
  REFERENCES "Learner"(id)
  ON DELETE CASCADE;

-- Grant access to authenticated users
GRANT ALL ON schedule_preferences TO authenticated;

CREATE POLICY "Users can view their own preferences"
  ON schedule_preferences FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "Learner"
    WHERE "Learner".id = schedule_preferences.learner_id
    AND "Learner".phone = (auth.jwt() ->> 'phone')
  ));

CREATE POLICY "Users can insert their own preferences"
  ON schedule_preferences FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Learner"
    WHERE "Learner".id = schedule_preferences.learner_id
    AND "Learner".phone = (auth.jwt() ->> 'phone')
  ));

CREATE POLICY "Users can update their own preferences"
  ON schedule_preferences FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM "Learner"
    WHERE "Learner".id = schedule_preferences.learner_id
    AND "Learner".phone = (auth.jwt() ->> 'phone')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Learner"
    WHERE "Learner".id = schedule_preferences.learner_id
    AND "Learner".phone = (auth.jwt() ->> 'phone')
  ));

CREATE POLICY "Users can delete their own preferences"
  ON schedule_preferences FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM "Learner"
    WHERE "Learner".id = schedule_preferences.learner_id
    AND "Learner".phone = (auth.jwt() ->> 'phone')
  ));

-- Keep the admin policies
CREATE POLICY "Admins can view all preferences"
  ON schedule_preferences FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'user_role' = 'admin'
    )
  );

CREATE POLICY "Admins can manage all preferences"
  ON schedule_preferences FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'user_role' = 'admin'
    )
  );
