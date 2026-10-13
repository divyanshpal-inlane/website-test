-- 20261013 — Funnel-origin marker on ll_applications.
--
-- Companion to `20261012120000_enrollment_funnel_source.sql` (which tagged
-- `enrollment`). The direct-booking funnel auto-creates an `ll_applications`
-- row at `payment_received` inside the `approve-booking-payment` edge function
-- whenever the learner bought an RTO add-on (`rto_*`). That row is the ONLY
-- evidence today that an RTO application came from the funnel rather than the
-- web-app's own RTO flow / the admin LL migration.
--
-- The new admin Analytics module reports the LL/RTO application pipeline split
-- by source, so `ll_applications` needs the same explicit marker as
-- `enrollment`. `approve-booking-payment` sets `acquired_via_funnel = true` on
-- the insert.
--
-- Reported in DB_change.md. Applied to prod via the Management API.

alter table ll_applications
  add column if not exists acquired_via_funnel boolean not null default false;

comment on column ll_applications.acquired_via_funnel is
  'True when the LL/RTO application row was auto-created by the direct-booking funnel (approve-booking-payment edge function) rather than by the web-app RTO flow or admin migration.';

-- Backfill: the funnel is the only writer that stamps its auto-created pipeline
-- events with actor_name = 'auto-approved' (and the note "RTO services booked
-- via funnel"). Idempotent — only flips rows still false.
update ll_applications a
   set acquired_via_funnel = true
 where a.acquired_via_funnel = false
   and exists (
     select 1
       from ll_pipeline_events e
      where e.application_id = a.id
        and e.actor_name = 'auto-approved'
   );
