-- Add imported calendar events columns to Instructor table
ALTER TABLE "public"."Instructor"
ADD COLUMN IF NOT EXISTS "imported_calendar_events" jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS "imported_calendar_updated_at" timestamp with time zone;

-- Add comment for documentation
COMMENT ON COLUMN "public"."Instructor"."imported_calendar_events" IS 'Stores imported calendar events from ICS files (Google Calendar, Apple Calendar, Outlook, etc.)';
COMMENT ON COLUMN "public"."Instructor"."imported_calendar_updated_at" IS 'Timestamp of last calendar import';
