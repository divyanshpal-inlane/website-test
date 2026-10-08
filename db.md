# DB Change Log — INLANE Booking Funnel

Every change made to a **database** for the booking funnel is recorded here.
Code-only changes belong in `AGENTS.md`, not here.

> **Rule:** if it touches schema, data, RLS, grants, functions, triggers, cron, or
> `app_settings`, it gets an entry in this file — no exceptions.

---

## 1. Database of record

| | |
|---|---|
| Project ref | `csnzgfzxnscumvjefpon` (INLANE production) |
| Region | `ap-south-1` |
| Hosting | Supabase Cloud (no local Docker DB) |
| Legacy project | `olbeoxiiafvzermhynic` — **never touch** |

### Non-negotiable rules

1. **ANY** DB change (DDL, DML, RLS, grants, functions, cron, `app_settings`) requires
   the user's **explicit approval before it is executed**.
2. Migrations live in `supabase/migrations/`. They are the source of truth and must be
   committed, even when they were applied by hand in the Supabase dashboard.
3. Migrations must be **idempotent** (`if not exists`, `create or replace`, guarded
   `jsonb_set`) so a re-run is a no-op.
4. Never use `Set-Content -Encoding utf8` to write `.env` or any file git must read —
   PowerShell writes a BOM and it breaks the Supabase CLI env parser.
5. Secrets (DB password, PATs, service-role key, Contentful token) are **never** stored
   in this repo, in this file, or in any migration.

### How DB changes are executed

Direct `psql` / `supabase db query` / `migration list --linked` **fail** on this
network (`db.<ref>` is IPv6-only; the pooler needs SNI local tooling cannot satisfy).

Use the **Management API SQL endpoint** with a PAT:

```
POST https://api.supabase.com/v1/projects/csnztyzmokacinuhnuih/database/query
Authorization: Bearer <PAT>
{"query": "..."}
```

It returns only the **last** result set, so verifications must be written as a single
combined `SELECT` with subqueries.

---

## 2. Change log

| # | Date | Migration | Target | Change | Applied | Verified |
|---|---|---|---|---|---|---|
| 1 | 2026-09-09 | `20260909120000_direct_booking_schema.sql` | test | Tables `booking`, `booking_addons`, `course_addons`, `enrollment_addons`; `Instructor.gender`; `Learner.two_wheeler_license_state`; `Schedule.booking_id`/`payment_id`; RLS; `reserve_booking_slots` | ✅ | ✅ |
| 2 | 2026-09-09 | `20260909120001_direct_booking_seed.sql` | test | `booking_flow` `app_settings` row; RTO add-on seed | ✅ | ✅ |
| 3 | 2026-09-09 | `20260909120002_add_has_two_wheeler_license.sql` | test | `Learner.has_two_wheeler_license` | ✅ | ✅ |
| 4 | 2026-09-09 | `20260909120003_add_two_wheeler_licence_in_ka.sql` | test | `two_wheeler_licence_in_ka` on `Learner` + `booking` | ✅ | ✅ |
| 5 | 2026-09-09 | `20260909120004_add_course_display_fields.sql` | test | `Courses.description`, `Courses.is_recommended` | ✅ | ✅ |
| 6 | 2026-09-10 | `20260910120000_booking_slot_lifecycle.sql` | test | `_expire_stale_booking_holds`; `reserve_booking_slots` v2; `change_booking_slot` RPC | ✅ | ✅ |
| 7 | 2026-09-10 | `20260910120001_courses_code_unique.sql` | test | Unique index `idx_courses_code_unique` on `Courses.code` | ✅ | ✅ |
| 8 | 2026-09-12 | `20260912120000_booking_gap_load_consecutive.sql` | test | `instructor_gap_minutes=30`; `reserve_booking_slots` v3; `change_booking_slot` v2 | ✅ | ✅ |
| 9 | 2026-09-12 | `20260912120001_booking_payment_mode.sql` | test | `booking_flow.payment_mode='test'` | ✅ | ✅ |
| 10 | 2026-09-16 | `20260914120000_concurrency_hardening.sql` | test | Both janitors, `reserve`/`change`/`confirm` RPCs hardened; `payment_mode` seed | ✅ | ✅ |
| 11 | 2026-09-17 | `20260917120000_instructor_service_zones.sql` | test | `zone_name_aliases` + `instructor_service_zones`; seeded 66 zones/aliases | ✅ | ✅ |
| 12 | 2026-09-17 | `20260917120001_booking_location_fields.sql` | test | `booking.latitude/longitude/location_name` | ✅ | ✅ |
| 13 | 2026-10-04 | *(approved DML, no migration file)* | **prod** | `booking_flow.payment_mode='test'` added via guarded `jsonb_set` (only if key absent). Every other key unchanged. | ✅ | ✅ |
| 14 | 2026-10-04 | `prod_booking_migration.sql` (concatenation of #1–#6, #10–#12; excluded `instructor_service_zones` + `courses_code_unique`) | **prod** | Full booking schema applied as **one transaction** (`lock_timeout 3s`, dry-run + rollback first): tables `booking`/`booking_addons`(+RTO seed)/`course_addons`/`enrollment_addons` (RLS on, no policies), RPCs `reserve_booking_slots`/`change_booking_slot`/`_expire_stale_booking_holds`/`_cleanup_stale_bookings` (service_role only), nullable columns on `Instructor`/`Learner`/`Courses`/`Schedule` (+2 partial indexes) | ✅ | ✅ |
| 15 | 2026-10-05 | `20260905120000_booking_janitor_scheduling.sql` | **prod** | Janitor functions made safe + **both janitors scheduled via `pg_cron`** | ✅ (user, "Success. No rows returned") | ✅ verified 2026-10-05 |

### Verification of #15 (prod, Management API)

| Check | Result |
|---|---|
| `cron.job` `booking-expire-holds` | present, `active = true`, `*/5 * * * *` |
| `cron.job` `booking-cleanup-stale` | present, `active = true`, `17 * * * *` |
| Runs observed | `booking-expire-holds` ran 4× at 08:50 / 08:55 / 09:00 / 09:05 — all **`succeeded`** |
| Janitor + booking RPCs present | 4 of 4 (`_expire_stale_booking_holds`, `_cleanup_stale_bookings`, `reserve_booking_slots`, `change_booking_slot`) |
| **27 legacy unlinked holds** | **still intact** — the `booking_id is not null` guard works as designed |
| Stale funnel holds remaining | 0 (janitor is doing its job) |
| Bookings stuck in `conflict`/`abandoned` | 0 |
| `booking_flow` | `hold_minutes = 15`, `payment_mode = test`, `enabled = true` |

> The dangerous unscoped payment purge is gone: this version snapshots only payments
> attached to the enrollments it is about to delete. The previous version would have
> deleted **170 unrelated live-app `payment` rows** on prod.

### Applied to prod but NOT present as a migration file

| Item | Why |
|---|---|
| `booking_flow.payment_mode='test'` (#13) | Single-key DML. Migrate the `jsonb_set` into a migration file so prod can be rebuilt. |
| `prod_booking_migration.sql` (#14) | Concatenation of existing migrations. **Untracked** — see §6. |

> The prod `instructor_service_zones` table is **pre-existing in prod** and is NOT ours.
> Prod's own schema (`raw_name`/`coordinates`/`kind`/`is_rough`) is the source of truth
> for the polygon serviceability rule; migration #11 documents the test-DB shape only.

---

## 3. Current schema state (prod)

### Tables added by the funnel

| Table | RLS | Purpose |
|---|---|---|
| `booking` | on (service-role only, no policies) | One customer booking. `area_id` is **nullable**. |
| `booking_addons` | on | Add-ons chosen on a booking (RTO assistance seeded). |
| `course_addons` | on | Add-on catalogue. |
| `enrollment_addons` | on | Add-ons attached to an enrollment. |

### Columns added to existing tables

| Table | Column | Type | Notes |
|---|---|---|---|
| `Instructor` | `gender` | text | New column for the booking funnel. |
| `Instructor` | `radius`, `latitude`, `longitude`, `areas`, `status`, `unavailability` | — | **Pre-existing in prod**, not ours. |
| `Learner` | `two_wheeler_license_state` | text | |
| `Learner` | `has_two_wheeler_license`, `two_wheeler_licence_in_ka` | bool / bool | Karnataka only (not AP). |
| `booking` | `two_wheeler_licence_in_ka`, `latitude`, `longitude`, `location_name`, `area_id` (nullable) | | |
| `Courses` | `description`, `is_recommended` | text / bool | `is_recommended` defaults false. |
| `Schedule` | `booking_id`, `payment_id` | uuid FK | `ON DELETE SET NULL` + partial indexes. |

### Database functions

All are `SECURITY DEFINER`, `search_path = public`, revoked from `public`/`anon`/`authenticated`
and granted **only** to `service_role`.

| Function | Purpose |
|---|---|
| `reserve_booking_slots` | Atomic multi-slot hold. v3: per-`(instructor,date)` advisory lock + booking `FOR UPDATE`, buffered conflicts vs other bookings, pure overlap vs own lessons, consecutive-slot rule. |
| `change_booking_slot` | Atomic same-instructor lesson move. v2: widened to `status in ('pending_payment','booked')` so paid lessons are reschedulable. |
| `_expire_stale_booking_holds(uuid)` | Cancels other bookings' stale `pending_payment` holds. `booking_id is not null` keeps the 27 legacy unlinked prod rows safe. |
| `_cleanup_stale_bookings(int,int)` | Marks stale `created` bookings `abandoned`, purges old `conflict`/`abandoned` bookings + their scoped orphan enrollments/payments. |

### Triggers we did **not** create (pre-existing in prod)

Fired by our `Schedule` inserts:

- `reset_learner_scheduling_flag_trigger` → sets `Learner.needs_scheduling = false`
- `schedule_assign_enrollment_trigger` → auto-links `enrollment_id` by learner+course

### Cron jobs (prod) — scheduled by #15

| Job | Schedule | Command |
|---|---|---|
| `booking-expire-holds` | `*/5 * * * *` | `select public._expire_stale_booking_holds(null)` |
| `booking-cleanup-stale` | `17 * * * *` | `select public._cleanup_stale_bookings(60, 7)` |

Offset (`17 *`) deliberately avoids the 7 existing live-app jobs.
Scheduling is deterministic: unschedule-by-name then schedule, so re-running is safe.

---

## 4. `booking_flow` config (`app_settings`)

The single source of truth for the funnel. Every rule is read from here — never hardcoded.
`_shared/config.ts` is **fail-closed**: any missing/invalid required field sets `enabled:false`.

Prod values as of #15:

| Key | Value | Note |
|---|---|---|
| `enabled` | `true` | Updated 2026-09-18. |
| `payment_mode` | `test` | Added by #13. **Test mode: verify approves all.** |
| `gateway` | `razorpay` | |
| `hold_minutes` | `15` | Read by both janitors. |
| `slot_start` / `slot_end` | `06:00` / `22:00` | |
| `slot_grid_minutes` | `30` | |
| `slot_duration_minutes` | `60` | |
| `instructor_gap_minutes` | `15` | Travel buffer vs other bookings. |
| `booking_days_ahead` | `14` | |
| `max_slots_per_booking` | `12` | |
| `female_instructor_mode` | `off` | |
| `installment_modes` | `["full"]` | |
| `view_days_ahead` | `400` | Used by the reference app's Sales Dashboard. |
| `excluded_schedule_statuses` | `["cancelled","rejected"]` | Same. |

> **Blast radius:** this row is **shared** with the live app's Sales Dashboard, which reads
> the slot window/grid/duration/gap for its tentative-booking creation. Changing those keys
> changes the Sales Dashboard too. Only `payment_mode` was added; nothing else was touched.

---

## 5. Serviceability rule (current)

**Polygon only.** `resolveServiceability` (`_shared/serviceability.ts`) requires all of:

1. Instructor `status` is `active` (allow-list; `on_break`/`inactive` excluded).
2. Instructor has a **non-rough** `instructor_service_zones` polygon.
3. The learner point is inside that polygon (holes respected).
4. Nothing else — `Instructor.areas[]` / `Serviceable_Areas` are **no longer** part of
   eligibility. The area name is a best-effort label only and may be null.

`check-location-serviceability` returns `serviceable`, `areaLabel`, and
`eligibleInstructorCount` — **never** instructor identity.

---

## 6. Open DB work

- [x] **Verify cron after #15** — both jobs present and active, `booking-expire-holds`
      fired 4× with `succeeded`, 27 legacy holds untouched. See §2.
- [ ] **Commit the two untracked prod changes as real migration files**: the
      `payment_mode` `jsonb_set` and `prod_booking_migration.sql`.
- [x] Add `supabase/` to git — approved 2026-10-05; still needs staging + commit.
- [ ] `prod_booking_migration.sql` lives only in a temp dir and will be lost.
- [ ] Rotate the exposed Supabase PAT and the exposed Contentful token.

---

## 7. Verification recipes

```sql
-- cron jobs present?
select jobname, schedule, command, active from cron.job order by jobname;

-- has the expire janitor actually run?
select jobid, runid, status, start_time from cron.job_run_details
where jobid = (select jobid from cron.job where jobname='booking-expire-holds')
order by runid desc limit 5;

-- funnel RPCs present + restricted?
select p.proname, p.prosecdef,
       has_function_privilege('anon', p.oid, 'EXECUTE')   as anon_can_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as svc_can_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and p.proname in ('reserve_booking_slots','change_booking_slot',
                    '_expire_stale_booking_holds','_cleanup_stale_bookings')
order by p.proname;

-- booking_flow
select value from app_settings where key='booking_flow';

-- funnel tables + RLS
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
  ('booking','booking_addons','course_addons','enrollment_addons')
order by c.relname;

-- dry-run the cleanup janitor (read-only; it mutates, so inspect its logic, don't run blind)
select public._cleanup_stale_bookings(60, 7);
```