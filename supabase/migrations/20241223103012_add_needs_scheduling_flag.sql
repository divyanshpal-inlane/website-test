-- Add needs_scheduling flag to Learner table
ALTER TABLE "Learner" ADD COLUMN IF NOT EXISTS needs_scheduling boolean DEFAULT false;

-- Create a function to update needs_scheduling flag when preferences are updated
CREATE OR REPLACE FUNCTION update_learner_scheduling_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If inserting or updating preferences, set needs_scheduling to true
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    UPDATE "Learner"
    SET needs_scheduling = true
    WHERE id = NEW.learner_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for schedule_preferences table
DROP TRIGGER IF EXISTS update_learner_scheduling_flag_trigger ON schedule_preferences;
CREATE TRIGGER update_learner_scheduling_flag_trigger
  AFTER INSERT OR UPDATE
  ON schedule_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_learner_scheduling_flag();

-- Create function to update needs_scheduling flag when schedule is requested for reschedule
CREATE OR REPLACE FUNCTION update_learner_scheduling_flag_on_reschedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If updating schedule status to reschedule_requested, set needs_scheduling to true
  IF (NEW.status = 'reschedule_requested') THEN
    UPDATE "Learner"
    SET needs_scheduling = true
    WHERE id = NEW.learner_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for Schedule table
DROP TRIGGER IF EXISTS update_learner_scheduling_flag_reschedule_trigger ON "Schedule";
CREATE TRIGGER update_learner_scheduling_flag_reschedule_trigger
  AFTER UPDATE
  ON "Schedule"
  FOR EACH ROW
  EXECUTE FUNCTION update_learner_scheduling_flag_on_reschedule();

-- Create function to reset needs_scheduling flag when schedule is created
CREATE OR REPLACE FUNCTION reset_learner_scheduling_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- When a new schedule is created, reset the needs_scheduling flag
  UPDATE "Learner"
  SET needs_scheduling = false
  WHERE id = NEW.learner_id;
  RETURN NEW;
END;
$$;

-- Create trigger to reset flag when schedule is created
DROP TRIGGER IF EXISTS reset_learner_scheduling_flag_trigger ON "Schedule";
CREATE TRIGGER reset_learner_scheduling_flag_trigger
  AFTER INSERT
  ON "Schedule"
  FOR EACH ROW
  EXECUTE FUNCTION reset_learner_scheduling_flag(); 