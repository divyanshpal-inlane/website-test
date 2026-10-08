-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow admins to view all enrollments" ON enrollment;
DROP POLICY IF EXISTS "Allow admins to manage all enrollments" ON enrollment;
DROP POLICY IF EXISTS "Allow admins to view all schedules" ON "Schedule";
DROP POLICY IF EXISTS "Allow admins to manage all schedules" ON "Schedule";

-- Create policies for admins to view and manage enrollments
CREATE POLICY "Allow admins to view all enrollments"
  ON enrollment
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Admin"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );

CREATE POLICY "Allow admins to manage all enrollments"
  ON enrollment
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "Admin"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );

-- Create policies for admins to view and manage schedules
CREATE POLICY "Allow admins to view all schedules"
  ON "Schedule"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Admin"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );

CREATE POLICY "Allow admins to manage all schedules"
  ON "Schedule"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "Admin"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );

-- Create policies for admins to view and manage courses and lessons
DROP POLICY IF EXISTS "Allow admins to view all courses" ON "Courses";
DROP POLICY IF EXISTS "Allow admins to manage all courses" ON "Courses";
DROP POLICY IF EXISTS "Allow admins to view all lessons" ON "Lesson";
DROP POLICY IF EXISTS "Allow admins to manage all lessons" ON "Lesson";

CREATE POLICY "Allow admins to view all courses"
  ON "Courses"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Admin"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );

CREATE POLICY "Allow admins to manage all courses"
  ON "Courses"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "Admin"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );

CREATE POLICY "Allow admins to view all lessons"
  ON "Lesson"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Admin"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );

CREATE POLICY "Allow admins to manage all lessons"
  ON "Lesson"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "Admin"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );

-- Create policies for admins to view and manage learners and instructors
DROP POLICY IF EXISTS "Allow admins to view all learners" ON "Learner";
DROP POLICY IF EXISTS "Allow admins to manage all learners" ON "Learner";
DROP POLICY IF EXISTS "Allow admins to view all instructors" ON "Instructor";
DROP POLICY IF EXISTS "Allow admins to manage all instructors" ON "Instructor";

CREATE POLICY "Allow admins to view all learners"
  ON "Learner"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Admin"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );

CREATE POLICY "Allow admins to manage all learners"
  ON "Learner"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "Admin"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );

CREATE POLICY "Allow admins to view all instructors"
  ON "Instructor"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Admin"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );

CREATE POLICY "Allow admins to manage all instructors"
  ON "Instructor"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "Admin"
      WHERE phone = auth.jwt() ->> 'phone'
    )
  );
