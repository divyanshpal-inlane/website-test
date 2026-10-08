-- GPS tracking points captured during lessons
CREATE TABLE IF NOT EXISTS lesson_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id BIGINT REFERENCES "Schedule"(id) ON DELETE CASCADE NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  captured_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('start', 'tracking', 'end'))
);

CREATE INDEX idx_lesson_tracking_schedule ON lesson_tracking(schedule_id);
CREATE INDEX idx_lesson_tracking_captured ON lesson_tracking(captured_at);

-- Enable RLS
ALTER TABLE lesson_tracking ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert tracking points
CREATE POLICY "Authenticated users can insert tracking points"
  ON lesson_tracking FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to read tracking points
CREATE POLICY "Authenticated users can read tracking points"
  ON lesson_tracking FOR SELECT
  TO authenticated
  USING (true);
