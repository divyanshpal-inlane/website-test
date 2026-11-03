# Phase 0 — Changes Log

> Track every change made for Phase 0 so the team can revert if needed.
> Created: 2026-10-21. Repository: `inlane-web-main`.

---

## DB / Supabase Changes

| # | Date | What | Status | Rollback |
|---|---|---|---|---|
| 1 | 2026-10-21 (prior) | Migration `20261021120000_funnel_instrumentation.sql` — creates `lead_sessions`, `funnel_leads`, `lead_events` | ✅ Applied to prod | `DROP TABLE ...` (no existing data to preserve) |
| 2 | 2026-10-21 (prior) | Migration `20261021130000_funnel_instrumentation_phase0_delta.sql` (M1–M5) | ✅ Applied to prod | `ALTER TABLE ... DROP COLUMN ...` |
| 3 | 2026-10-20 (prior) | Edge function `track-event` deployed to prod (v3, `verify_jwt=false`) | ✅ Live | `supabase functions delete track-event` |
| 4 | 2026-10-20 (prior) | Edge function `capture-lead` deployed to prod (v5, `verify_jwt=false`) | ✅ Live | `supabase functions delete capture-lead` |
| 5 | 2026-10-20 (prior) | `check-location-serviceability` modified to emit `location_entered` (v11) | ✅ Live | Re-deploy v10 |
| 6 | 2026-10-20 (prior) | `get-booking-slots` modified to emit `slots_viewed`/`slot_selected` (v72) | ✅ Live | Re-deploy v71 |
| 7 | 2026-10-20 (prior) | `create-booking` modified to call `captureLead` (v22) | ✅ Live | Re-deploy v21 |
| 8 | 2026-10-20 (prior) | `confirm-booking` modified to emit `booking_confirmed` (v8) | ✅ Live | Re-deploy v7 |

> **No new DB or Supabase changes were made in this session.** All infrastructure was
> already applied/deployed prior. This session only modifies frontend files.

---

## Frontend Code Changes (this session)

| # | File | Change |
|---|---|---|
| 1 | `src/components/SignupPopup.jsx` | Wired to `capture-lead` edge function; removed PII `console.log` statements; added `lead_form_started` + `lead_form_validation_failed` tracking; kept original Sheets/Cratio as `clientFallback` |
| 2 | `src/pages/Signup.jsx` | Wired to `capture-lead` edge function; removed PII `console.log` statements; added `lead_form_started` + `lead_form_validation_failed` tracking; kept original Sheets/Cratio as `clientFallback` |
| 3 | `src/pages/LandingPage.jsx` | Added `home_viewed` funnel event on mount |

---

## Rollback Instructions

**Frontend changes** (revert with `git checkout`):
```bash
git checkout -- src/components/SignupPopup.jsx src/pages/Signup.jsx src/pages/LandingPage.jsx
```

**DB changes** (already in prod — only needed if removing Phase 0 entirely):
```sql
-- Run via Supabase Management API SQL endpoint:
DROP TABLE IF EXISTS public.lead_events, public.funnel_leads, public.lead_sessions, public.funnel_rate_limits CASCADE;
DROP FUNCTION IF EXISTS public.exec_sql(text); -- if it was added
```

**Edge function removal** (only if needed):
```bash
supabase functions delete track-event capture-lead
```

## Frontend changes applied (this session) — revert with `git checkout <file>`
- `src/components/SignupPopup.jsx`: submit now calls `capture-lead` first; original Sheets + Cratio POSTs run only if it returns `clientFallback: true` or is unreachable. Removed PII console.logs. Passes `client_session_id` from `getFunnelSessionId()`.
- `src/pages/Signup.jsx`: same pattern (source `signup_page`, sends marketing consent). PII/debug logs removed.
- `src/pages/LandingPage.jsx`: `home_viewed` (page_type `home`) on mount; `expert_contact_requested` (cta_location `hero`) on "Talk to an expert" click.
- New: `.env.example` (documents `VITE_FUNNEL_TRACKING=off` kill-switch), `docs/funnel_metrics.sql` (baseline queries).
- No DB / edge function changes in this step.
- Note: `lead_form_started` / `lead_form_validation_failed` are NOT in the canonical taxonomy, so they were deliberately not instrumented.
- Verification: all `_tests` unit suites pass; `vite build` succeeds.
- Not done: ThankYou page events (no taxonomy event exists for it), E2E/integration tests, staging deploy.
