-- Add unique constraint on Lesson table to prevent duplicate lessons per course
-- This ensures each course can only have one lesson with each lesson number

-- First, let's make sure there are no remaining duplicates before adding the constraint
-- (This is a safety check - the app cleanup should have already removed them)

-- Add unique constraint on (course_id, number)
-- This will fail if there are still duplicates, ensuring data integrity
ALTER TABLE "public"."Lesson"
ADD CONSTRAINT "lesson_course_id_number_unique" UNIQUE (course_id, number);

-- Add a comment explaining the constraint
COMMENT ON CONSTRAINT "lesson_course_id_number_unique" ON "public"."Lesson"
IS 'Prevents duplicate lessons with the same number for a course';
