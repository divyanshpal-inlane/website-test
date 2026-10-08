-- Add 'address' and 'radius' columns to the 'Instructor' table
ALTER TABLE "Instructor"
ADD COLUMN address VARCHAR(255) NULL,
ADD COLUMN radius NUMERIC(10, 2) NULL;