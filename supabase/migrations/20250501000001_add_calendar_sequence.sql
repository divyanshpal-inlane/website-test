-- Add sequence column to Schedule table
ALTER TABLE "public"."Schedule" 
ADD COLUMN "calendar_sequence" INTEGER DEFAULT 0;

-- Add comment to the column for documentation
COMMENT ON COLUMN "public"."Schedule"."calendar_sequence" IS 'Sequence number for calendar events, incremented on updates';