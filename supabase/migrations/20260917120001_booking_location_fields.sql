-- Location-based booking: learner's checkout latitude/longitude + human
-- location label, captured at booking time so a booking is self-describing
-- even if the source area is later renamed/merged.
-- (2026-09-17)
alter table public.booking add column if not exists latitude numeric(10, 7);
alter table public.booking add column if not exists longitude numeric(10, 7);
alter table public.booking add column if not exists location_name text;