-- Step 1: Add latitude and longitude columns to the Instructor table
ALTER TABLE "Instructor" 
ADD COLUMN IF NOT EXISTS "latitude" DECIMAL(10, 7),
ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(10, 7);

-- Step 2: Create a new enum type that includes all existing values plus CNG and LPG
-- First, check if the type already exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'car_fuel_type_new') THEN
        -- Create new enum type with all values
        CREATE TYPE car_fuel_type_new AS ENUM ('petrol', 'diesel', 'ev', 'cng', 'lpg');
    END IF;
END
$$;

-- Step 3: Update the column to use the new enum type
-- First, create a temporary column with the new type
ALTER TABLE "Instructor" 
ADD COLUMN "car_fuel_type_new" car_fuel_type_new;

-- Copy data from old column to new column
UPDATE "Instructor" 
SET "car_fuel_type_new" = 
    CASE 
        WHEN "car_fuel_type" = 'petrol' THEN 'petrol'::car_fuel_type_new
        WHEN "car_fuel_type" = 'diesel' THEN 'diesel'::car_fuel_type_new
        WHEN "car_fuel_type" = 'ev' THEN 'ev'::car_fuel_type_new
        ELSE NULL
    END;

-- Drop the old column and rename the new one (split into separate statements)
ALTER TABLE "Instructor" DROP COLUMN IF EXISTS "car_fuel_type";
ALTER TABLE "Instructor" ALTER COLUMN "car_fuel_type_new" SET DEFAULT 'petrol'::car_fuel_type_new;
ALTER TABLE "Instructor" RENAME COLUMN "car_fuel_type_new" TO "car_fuel_type";

-- Step 4: Create a simple Serviceable_Areas table with just area names
CREATE TABLE IF NOT EXISTS "Serviceable_Areas" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL UNIQUE,
    "active" BOOLEAN DEFAULT TRUE,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add a trigger to update the updated_at timestamp
CREATE TRIGGER set_serviceable_areas_timestamp
BEFORE UPDATE ON "Serviceable_Areas"
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();

-- Enable Row Level Security
ALTER TABLE "Serviceable_Areas" ENABLE ROW LEVEL SECURITY;

-- Create policies for the table
-- Allow authenticated users to read serviceable areas
CREATE POLICY "Allow read access for authenticated users" ON "Serviceable_Areas"
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Allow admins to manage serviceable areas
CREATE POLICY "Allow full access for admins" ON "Serviceable_Areas"
    FOR ALL
    USING (get_my_claim('user_role')::text = '"admin"');

-- Populate Serviceable_Areas with the union of all existing instructor areas
DO $$
DECLARE
    area_names TEXT[];
    area_name TEXT;
BEGIN
    -- Get all unique area names from all instructors
    SELECT ARRAY(
        SELECT DISTINCT unnest(areas)
        FROM "Instructor"
        WHERE areas IS NOT NULL
    ) INTO area_names;
    
    -- Insert each unique area into the Serviceable_Areas table
    FOREACH area_name IN ARRAY area_names LOOP
        INSERT INTO "Serviceable_Areas" (name)
        VALUES (area_name)
        ON CONFLICT (name) DO NOTHING;
    END LOOP;
END
$$;

