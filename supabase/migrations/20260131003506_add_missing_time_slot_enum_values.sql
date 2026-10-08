-- Add missing time_slot enum values that the frontend supports
-- The frontend has "5-6" (5 AM - 6 AM) and "21-23" (9 PM - 11 PM) but database was missing these

-- Add '5-6' before '6-9' (at the beginning)
ALTER TYPE time_slot ADD VALUE '5-6' BEFORE '6-9';

-- Add '21-23' after '18-21' (at the end)
ALTER TYPE time_slot ADD VALUE '21-23' AFTER '18-21';
