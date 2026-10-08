-- Additive / prod-safe. Courses.code drives the upstream WHERE NOT EXISTS
-- catalogue inserts; enforce uniqueness for non-null codes only.
-- (Postgres allows multiple NULLs in a btree unique index, so the legacy
-- NULL-code rows are fine.)
create unique index if not exists idx_courses_code_unique
  on public."Courses" (code);