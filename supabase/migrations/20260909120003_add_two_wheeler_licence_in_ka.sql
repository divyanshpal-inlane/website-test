-- Local: persist the "Is your 2-wheeler licence from Karnataka?" answer from
-- the booking flow (only asked when the learner has no 4W DL but holds a 2W
-- LL/DL). Additive and prod-safe; mirrors the has_two_wheeler_license column.

alter table public."Learner"
  add column if not exists two_wheeler_licence_in_ka boolean;

alter table public."booking"
  add column if not exists two_wheeler_licence_in_ka boolean;