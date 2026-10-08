-- P0 fix: prevent double-booking of instructor time slots at the DB level.
--
-- This constraint is SCOPED to rows created after the cleanup snapshot
-- (id > 19065). Legacy rows contain 47 known partial-overlap pairs that
-- admins will resolve manually over time. Scoping to new rows lets us
-- enforce "no future double-booking" immediately without being blocked by
-- legacy mess.
--
-- A schedule row is considered to occupy the instructor between
-- (date + start_time) and (date + end_time), inclusive-exclusive.
-- Rows with status = 'cancelled' or 'rejected' are excluded — they free up
-- the slot. Rows where start_time >= end_time are invalid data and are
-- excluded from the constraint.
--
-- The client-side checkScheduleConflict() helper covers the
-- "new row conflicts with old legacy row" case. This DB constraint is a
-- safety net against concurrent-write races between two new rows.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Schedule"
  ADD CONSTRAINT schedule_no_overlap_new_rows
  EXCLUDE USING gist (
    instructor_id WITH =,
    tsrange(
      (date + start_time)::timestamp,
      (date + end_time)::timestamp,
      '[)'
    ) WITH &&
  )
  WHERE (
    id > 19065
    AND status NOT IN ('cancelled', 'rejected')
    AND start_time < end_time
  );

COMMENT ON CONSTRAINT schedule_no_overlap_new_rows ON "Schedule" IS
  'Prevents two active (non-cancelled/rejected) schedule rows from overlapping for the same instructor. Scoped to rows with id > 19065 (post-cleanup snapshot 2026-04-21) to avoid blocking on legacy partial-overlap data that requires manual admin resolution.';
