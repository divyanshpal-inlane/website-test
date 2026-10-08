-- Create enum for reschedule request type
CREATE TYPE reschedule_request_type AS ENUM ('new', 'reschedule');

-- Add type column to reschedule_requests table with default value
ALTER TABLE reschedule_requests 
ADD COLUMN type reschedule_request_type NOT NULL DEFAULT 'reschedule';

-- Update existing rows to have the default value
UPDATE reschedule_requests SET type = 'reschedule' WHERE type IS NULL; 