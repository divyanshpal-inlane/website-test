-- Drop the preference column
ALTER TABLE schedule_preferences DROP COLUMN IF EXISTS preference;

-- Drop the preference_level enum type
DROP TYPE IF EXISTS preference_level;
