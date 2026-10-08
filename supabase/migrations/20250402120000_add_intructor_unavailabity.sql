-- Add LL_received column to Learner table
ALTER TABLE "Learner" 
ADD COLUMN "LL_received" BOOLEAN DEFAULT FALSE;

-- Add car_fuel_type column to Instructor table
CREATE TYPE car_fuel_type AS ENUM ('petrol', 'diesel', 'ev', 'hybrid');
ALTER TABLE "Instructor" 
ADD COLUMN "car_fuel_type" car_fuel_type;

-- Add unavailability column to Instructor table
-- Using JSONB to store unavailability periods in a flexible format
ALTER TABLE "Instructor" 
ADD COLUMN "unavailability" JSONB DEFAULT '[]'::jsonb;
-- Example format: [{"date": "2024-12-25", "all_day": true}, {"start_date": "2024-12-26", "end_date": "2024-12-28", "start_time": "09:00", "end_time": "17:00"}]

-- Add columns to Learner table for lesson preference questions
ALTER TABLE "Learner"
ADD COLUMN "preferred_start_date" DATE,
ADD COLUMN "preferred_completion_days" INTEGER,
ADD COLUMN "prefers_two_hour_classes" BOOLEAN DEFAULT FALSE;

-- Create RLS policies for the new columns

-- Learner can update their own LL_received status
CREATE POLICY "Learners can update their own LL_received status"
ON "Learner"
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Instructors can update their own car_fuel_type and unavailability
CREATE POLICY "Instructors can update their own car details and unavailability"
ON "Instructor"
FOR UPDATE
USING (auth.uid() = id_instructor)
WITH CHECK (auth.uid() = id_instructor);

-- Admins can view and update all records
CREATE POLICY "Admins can manage all instructor unavailability"
ON "Instructor"
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.role = 'admin'
  )
);

-- Add comment to explain the unavailability format
COMMENT ON COLUMN "Instructor"."unavailability" IS 'JSON array of unavailability periods. Format examples:
- For full day: {"date": "YYYY-MM-DD", "all_day": true}
- For time range: {"start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM"}
- For recurring: {"day_of_week": "monday", "start_time": "HH:MM", "end_time": "HH:MM"}';
