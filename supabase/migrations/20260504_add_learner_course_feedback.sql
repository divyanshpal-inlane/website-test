-- Learner-submitted feedback at course progress checkpoints (mid + final).
-- Mid checkpoint only triggers for courses with > 4 lessons; final triggers for all.
CREATE TABLE IF NOT EXISTS learner_course_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollment(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES "Learner"(id) ON DELETE CASCADE,
  checkpoint TEXT NOT NULL CHECK (checkpoint IN ('mid', 'final')),
  overall_rating INT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  instructor_rating INT NOT NULL CHECK (instructor_rating BETWEEN 1 AND 5),
  course_rating INT NOT NULL CHECK (course_rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(enrollment_id, checkpoint)
);

CREATE INDEX IF NOT EXISTS idx_learner_course_feedback_enrollment
  ON learner_course_feedback(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_learner_course_feedback_learner
  ON learner_course_feedback(learner_id);
CREATE INDEX IF NOT EXISTS idx_learner_course_feedback_created
  ON learner_course_feedback(created_at);

ALTER TABLE learner_course_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read learner course feedback"
  ON learner_course_feedback FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert learner course feedback"
  ON learner_course_feedback FOR INSERT
  TO authenticated
  WITH CHECK (true);
