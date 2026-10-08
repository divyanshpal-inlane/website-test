-- Add calendar_uid column to Schedule table
ALTER TABLE "Schedule" 
ADD COLUMN IF NOT EXISTS "calendar_uid" TEXT;

-- Add an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_schedule_calendar_uid ON "Schedule" ("calendar_uid");

-- Add comment explaining the purpose
COMMENT ON COLUMN "Schedule"."calendar_uid" IS 'Unique identifier for calendar events to enable cancellation when rescheduling';