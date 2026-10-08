-- Local: display fields for the course catalogue shown on the site.
-- Additive / prod-safe. description carries the marketing tagline and
-- is_recommended drives the "Recommended" badge on the booking flow.

alter table public."Courses"
  add column if not exists description text,
  add column if not exists is_recommended boolean default false;