-- Create enum for reschedule request status
CREATE TYPE reschedule_request_status AS ENUM ('pending_payment', 'pending', 'completed', 'cancelled');

-- Create reschedule requests table
CREATE TABLE IF NOT EXISTS "reschedule_requests" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  learner_id UUID NOT NULL REFERENCES "Learner"(id),
  lesson_ids UUID[] NOT NULL,
  payment_id UUID REFERENCES "payment"(id),
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status reschedule_request_status NOT NULL DEFAULT 'pending_payment',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE "reschedule_requests" ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own reschedule requests"
  ON "reschedule_requests"
  FOR SELECT
  USING (
    learner_id IN (
      SELECT id FROM "Learner"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );

CREATE POLICY "Users can create their own reschedule requests"
  ON "reschedule_requests"
  FOR INSERT
  WITH CHECK (
    learner_id IN (
      SELECT id FROM "Learner"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );

CREATE POLICY "Users can update their own reschedule requests"
  ON "reschedule_requests"
  FOR UPDATE
  USING (
    learner_id IN (
      SELECT id FROM "Learner"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  )
  WITH CHECK (
    learner_id IN (
      SELECT id FROM "Learner"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );

CREATE POLICY "Admins can view all reschedule requests"
  ON "reschedule_requests"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Admin"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );

CREATE POLICY "Admins can manage all reschedule requests"
  ON "reschedule_requests"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "Admin"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );

-- Create function to check if a schedule is within 72 hours
CREATE OR REPLACE FUNCTION is_within_72_hours(schedule_date DATE, schedule_time TIME)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (schedule_date + schedule_time - NOW()) < INTERVAL '72 hours';
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate reschedule fee
CREATE OR REPLACE FUNCTION calculate_reschedule_fee(lesson_ids UUID[])
RETURNS DECIMAL AS $$
DECLARE
  total_fee DECIMAL := 0;
  lesson_id UUID;
BEGIN
  FOREACH lesson_id IN ARRAY lesson_ids
  LOOP
    IF EXISTS (
      SELECT 1 FROM "Schedule"
      WHERE lesson_id = lesson_id
      AND is_within_72_hours(date, start_time::TIME)
    ) THEN
      total_fee := total_fee + 300;
    END IF;
  END LOOP;
  
  RETURN total_fee;
END;
$$ LANGUAGE plpgsql;
