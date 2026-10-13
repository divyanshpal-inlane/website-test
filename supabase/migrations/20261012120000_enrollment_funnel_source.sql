-- 20261012 — Funnel-origin marker on enrollment.
--
-- The direct-booking funnel creates the learner's `enrollment` row inside the
-- `create-booking` edge function. The learner webapp now shows a post-booking
-- "upload your documents" nudge (licence for Classes-only, the RTO doc set
-- otherwise). That nudge must only ever target learners who actually came
-- through the funnel; pre-existing / admin-created / legacy learners must not
-- be nagged. `enrollment.case_type` alone cannot distinguish the source (the
-- admin "Create New Learner" flow writes it too), so this additive column tags
-- funnel-created enrollments explicitly.
--
-- `create-booking` sets `acquired_via_funnel = true` on the enrollment insert.
-- The learner webapp gates its CTA on this flag.
--
-- Reported in DB_change.md. Applied to prod via the Management API.

alter table enrollment
  add column if not exists acquired_via_funnel boolean not null default false;

comment on column enrollment.acquired_via_funnel is
  'True when the enrollment row was created by the direct-booking funnel (create-booking edge function). The learner webapp uses it to scope the post-booking document-upload nudge to funnel-originated learners only.';

-- Backfill: enrollments already created by the funnel, matched to a booking on
-- the same learner + course. Only course bookings carry a course_id, so this
-- marks exactly the funnel course enrollments that exist today (idempotent).
update enrollment e
   set acquired_via_funnel = true
 where e.acquired_via_funnel = false
   and exists (
     select 1
       from booking b
      where b.learner_id = e.learner_id
        and b.course_id is not null
        and b.course_id = e.course_id
   );
