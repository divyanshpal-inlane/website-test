-- Add comments column to Learner table
ALTER TABLE "public"."Learner" 
ADD COLUMN "comments" TEXT DEFAULT NULL;

-- Add comment to the column for documentation
COMMENT ON COLUMN "public"."Learner"."comments" IS 'Admin notes and comments about the learner';
