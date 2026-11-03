-- 20261015 — Licence-resubmission marker on enrollment.
--
-- When Ops reviews a funnel booking in "Funnel Conversions" they can ask the
-- learner to resubmit their LL/DL documents (review-booking `reject`). That
-- request has to be remembered so two surfaces can react to it:
--
--   1. The admin review queue must HIDE the booking's card until the learner
--      acts (otherwise a rejected request looks identical to a fresh one).
--   2. The learner webapp must SHOW the document-upload window again, even
--      when the learner had already uploaded something (presence alone cannot
--      tell a first upload from a rejected one).
--
-- Both clear the moment the learner re-uploads (the Classes licence to the
-- `LL` bucket, or the RTO document set), so the card returns to the queue and
-- the learner-side nudge disappears.
--
-- The marker lives on `enrollment` (one row per funnel booking course) because
-- the queue is per-booking while the learner app can already read the
-- enrollment's funnel fields (`acquired_via_funnel`, `case_type`) — `booking`
-- itself is RLS-locked to service_role, so the learner app cannot read it.
--
-- Both columns are nullable and additive: no backfill, no default, no RLS /
-- grant / index change. `review-booking` writes them on reject and clears them
-- on approve; the learner app clears them on upload/submit.
--
-- Reported in DB_change.md. Applied to prod via the Management API.

alter table enrollment
  add column if not exists licence_resubmission_requested_at timestamptz;

alter table enrollment
  add column if not exists licence_resubmission_reason text;

comment on column enrollment.licence_resubmission_requested_at is
  'Set by the review-booking edge function when Ops asks a funnel learner to resubmit their LL/DL documents. While set, the booking is hidden from the Funnel Conversions review queue and the learner webapp shows the document-upload nudge. Cleared when the learner re-uploads (learner app) or the booking is approved.';

comment on column enrollment.licence_resubmission_reason is
  'The Ops-supplied reason shown to the learner with the resubmission request. Cleared alongside licence_resubmission_requested_at.';
