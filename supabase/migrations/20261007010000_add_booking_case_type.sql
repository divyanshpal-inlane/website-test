-- =============================================================================
-- Booking case type — what the customer is actually buying.
--   classes_only  -> driving classes only (no RTO paperwork)
--   course_rto    -> driving classes + optional RTO paperwork (default, unchanged)
--   rto_only      -> RTO paperwork only (no driving classes, no schedule, no
--                    enrollment). For rto_only bookings course_id stays null and
--                    course_name becomes nullable.
-- Additive + idempotent (if not exists) — safe to re-apply.
-- =============================================================================

alter table public.booking
  add column if not exists case_type text
    not null
    default 'course_rto'
    check (case_type in ('classes_only', 'course_rto', 'rto_only'));

comment on column public.booking.case_type is
  'What the customer is buying: classes_only (driving classes), course_rto (classes + RTO paperwork), or rto_only (RTO paperwork only — no course, no schedule, no enrollment).';

alter table public.booking
  alter column course_name drop not null;

create index if not exists idx_booking_case_type on public.booking (case_type);