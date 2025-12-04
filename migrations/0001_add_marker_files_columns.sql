-- Migration: Add submission_file_type enum and uploaded_by column to submission_files table
-- This migration adds support for distinguishing between learner submission files and marker feedback files

-- Step 1: Create the submission_file_type enum
DO $$ BEGIN
    CREATE TYPE "submission_file_type" AS ENUM('submission', 'feedback');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 2: Add the new columns to submission_files table
ALTER TABLE "submission_files" 
ADD COLUMN IF NOT EXISTS "submission_file_type" "submission_file_type" DEFAULT 'submission' NOT NULL,
ADD COLUMN IF NOT EXISTS "uploaded_by" text;

-- Step 3: Update existing rows to set uploaded_by from the submission's lms_user_id
-- This populates the uploaded_by field for all existing learner submission files
UPDATE "submission_files" sf
SET "uploaded_by" = (
    SELECT asub.lms_user_id 
    FROM "assignment_submissions" asub 
    WHERE asub.id = sf.submission_id
)
WHERE "uploaded_by" IS NULL;

-- Step 4: Add comment to document the columns
COMMENT ON COLUMN "submission_files"."submission_file_type" IS 'Type of file: submission (learner uploaded) or feedback (marker uploaded)';
COMMENT ON COLUMN "submission_files"."uploaded_by" IS 'Stores either users.id (for markers) or lms_user_id (for learners)';

