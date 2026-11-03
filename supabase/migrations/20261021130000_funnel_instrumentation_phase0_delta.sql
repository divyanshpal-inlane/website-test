-- 20261021130000_funnel_instrumentation_phase0_delta.sql
-- Phase 0 — additive delta on top of 20261021120000_funnel_instrumentation.sql.
--
-- APPROVED (user decision D6, 2026-10-21): "Approve — apply M1–M5".
--
-- Scope: M1–M5 from PHASE0_PLAN.md §2.5. Every statement is additive and
-- re-appliable:
--   * no existing column is dropped, renamed, retyped or re-constrained;
--   * no existing row is touched (the three funnel tables are empty at the
--     time of writing, but the statements are safe with data present);
--   * no existing policy, grant or index is modified;
--   * the pre-existing `funnel_leads.status` CHECK is left intact — the PRD
--     §4 lead-state vocabulary lives in the NEW `lead_state` column (D4);
--   * the pre-existing `lead_sessions.client_session_id` column keeps its
--     type; only its COMMENT is corrected (client session id lives in
--     sessionStorage — user decision D3).
--
-- Rollback: `alter table ... drop column ...` / `drop table funnel_rate_limits`.
-- Prefer NOT rolling back: rows already written are the Phase-0 baseline data.

-- ---------------------------------------------------------------------------
-- M1 — funnel_leads: PRD §6 fields + PRD §4 lead state + prioritisation tier
-- ---------------------------------------------------------------------------
alter table public.funnel_leads
  add column if not exists dl_status          text        null,
  add column if not exists area_id            text        null,
  add column if not exists state              text        null,
  add column if not exists priority_tier      text        null,
  add column if not exists last_activity_at   timestamptz null,
  add column if not exists cratio_sync_status text        null,
  add column if not exists lead_state         text        not null default 'new',
  add column if not exists marketing_consent  boolean     null;

comment on column public.funnel_leads.dl_status is
  'Coarse licence qualification: ''has_dl'' | ''no_dl'' | ''two_wheeler_ll_only'' | ''two_wheeler_active_dl'' | ''unknown''. Never the licence number itself.';
comment on column public.funnel_leads.area_id is
  'Service area id resolved server-side by the serviceability engine. Never raw coordinates.';
comment on column public.funnel_leads.state is
  'Indian state / region label.';
comment on column public.funnel_leads.priority_tier is
  'PRD §4 prioritisation tier: P0 | P1 | P2 | P3 | S | X. Recomputed server-side on every event; re-tiering is upward-only.';
comment on column public.funnel_leads.last_activity_at is
  'Timestamp of the most recent funnel event for this lead.';
comment on column public.funnel_leads.cratio_sync_status is
  'Delivery state of the authoritative Cratio forward: ''pending'' | ''synced'' | ''failed''. Set by capture-lead.';
comment on column public.funnel_leads.lead_state is
  'PRD §4 lead state: new -> captured -> slot_engaged -> payment_attempted -> converted | dropped | supply_blocked | priority_hold. Distinct from the legacy `status` column, which is left untouched.';
comment on column public.funnel_leads.marketing_consent is
  'Marketing consent flag captured with the lead, where the surface collects it.';

-- PRD §4 lead-state vocabulary.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'funnel_leads_lead_state_check'
  ) then
    alter table public.funnel_leads
      add constraint funnel_leads_lead_state_check
      check (lead_state in (
        'new', 'captured', 'slot_engaged', 'payment_attempted',
        'converted', 'dropped', 'supply_blocked', 'priority_hold'
      ));
  end if;
end $$;

-- PRD §4 prioritisation tiers.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'funnel_leads_priority_tier_check'
  ) then
    alter table public.funnel_leads
      add constraint funnel_leads_priority_tier_check
      check (priority_tier is null or priority_tier in ('P0', 'P1', 'P2', 'P3', 'S', 'X'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- M2 — lead_events: PRD §4 event-log payload (utm set + coarse device)
-- ---------------------------------------------------------------------------
alter table public.lead_events
  add column if not exists utm_source   text null,
  add column if not exists utm_medium   text null,
  add column if not exists utm_campaign text null,
  add column if not exists device_type  text null;

comment on column public.lead_events.utm_source is
  'Last-touch utm_source. Allow-listed, truncated, never PII.';
comment on column public.lead_events.utm_medium is
  'Last-touch utm_medium.';
comment on column public.lead_events.utm_campaign is
  'Last-touch utm_campaign.';
comment on column public.lead_events.device_type is
  'Coarse device class only: desktop | mobile | tablet. No fingerprinting — no canvas, fonts, hardware ids, or IP.';

-- ---------------------------------------------------------------------------
-- M3 — funnel_rate_limits: durable rate limiting across edge instances
-- ---------------------------------------------------------------------------
create table if not exists public.funnel_rate_limits (
  bucket_key   text primary key,
  window_start timestamptz not null default now(),
  count        integer     not null default 0,
  updated_at   timestamptz not null default now()
);

comment on table public.funnel_rate_limits is
  'Durable rate-limit buckets for funnel event ingestion. bucket_key is a non-reversible digest (never a raw IP, phone or email).';

create index if not exists idx_funnel_rate_limits_window_start
  on public.funnel_rate_limits (window_start);

alter table public.funnel_rate_limits enable row level security;
revoke all on public.funnel_rate_limits from anon, authenticated;
revoke all on public.funnel_rate_limits from public;

-- ---------------------------------------------------------------------------
-- M4 — metric-query index: (event_name, occurred_at desc)
-- ---------------------------------------------------------------------------
create index if not exists idx_lead_events_name_time
  on public.lead_events (event_name, occurred_at desc);

-- ---------------------------------------------------------------------------
-- M5 — state / tier indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_funnel_leads_lead_state
  on public.funnel_leads (lead_state);
create index if not exists idx_funnel_leads_priority_tier
  on public.funnel_leads (priority_tier);

-- ---------------------------------------------------------------------------
-- Comment correction (D3): the client session id lives in sessionStorage.
-- ---------------------------------------------------------------------------
comment on column public.lead_sessions.client_session_id is
  'Client-generated uuid4 held in sessionStorage under `lane_funnel_session_id`. Mapped 1:1 to the authoritative `id`. Never an email, phone or other PII.';
