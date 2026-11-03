-- 20261021120000_funnel_instrumentation.sql
-- Phase 0 — server-side acquisition-funnel instrumentation.
--
-- Three new, fully additive tables. No existing table is altered, no existing
-- row is touched, no destructive statement is used (every CREATE is guarded by
-- `if not exists`), so this file is safe to re-apply.
--
--   lead_sessions  — the stitching anchor. One row per anonymous browsing
--                    session. The client holds a `client_session_id` (uuid4 it
--                    generates and keeps in localStorage); the server owns
--                    `id` (the authoritative session id) and is the only writer
--                    of `lead_id`. This is what stops a visitor from
--                    stitching an arbitrary lead onto their session.
--
--   funnel_leads   — the lead record of record for marketing/funnel leads.
--                    Deliberately NOT the legacy `Learner` table (RLS
--                    disabled, anon-readable, holds PII). Deduplicated by
--                    `phone_normalized` (last 10 digits).
--
--   lead_events    — append-only event log. One row per funnel event.
--                    `UNIQUE (session_id, client_event_id)` makes retries
--                    idempotent; a partial unique index guarantees exactly one
--                    `lead_captured` row per lead.
--
-- RLS posture: RLS enabled with ZERO policies on all three tables, and
-- `REVOKE ALL ... FROM anon, authenticated` — service-role only. This matches
-- the existing `booking` / `game_launch_events` precedent. It deliberately does
-- NOT copy the legacy posture of `Learner` (RLS disabled / anon-readable).

-- ---------------------------------------------------------------------------
-- lead_sessions
-- ---------------------------------------------------------------------------
create table if not exists public.lead_sessions (
  id                  uuid primary key default gen_random_uuid(),
  client_session_id   uuid not null unique,
  lead_id             uuid null,
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),

  -- first-touch attribution (captured once, when the session is created)
  first_utm_source    text null,
  first_utm_medium    text null,
  first_utm_campaign  text null,
  first_referrer_host text null,
  first_page_path     text null
);

comment on table public.lead_sessions is
  'Anonymous funnel sessions. `client_session_id` is client-generated (uuid4); `id` is server-owned and authoritative. `lead_id` is set only by capture-lead.';
comment on column public.lead_sessions.client_session_id is
  'Client-generated uuid4 held in localStorage. Mapped 1:1 to the authoritative `id`.';
comment on column public.lead_sessions.lead_id is
  'Server-derived. Set by capture-lead only — never accepted from the client.';

create index if not exists idx_lead_sessions_lead_id
  on public.lead_sessions (lead_id);
create index if not exists idx_lead_sessions_created_at
  on public.lead_sessions (created_at desc);

-- ---------------------------------------------------------------------------
-- funnel_leads
-- ---------------------------------------------------------------------------
create table if not exists public.funnel_leads (
  id                 uuid primary key default gen_random_uuid(),
  phone_normalized   text not null unique,
  name               text null,
  email              text null,
  phone              text null,
  locality           text null,
  area               text null,
  source             text null,   -- homepage_popup | talk_to_expert | rto_modal | booking_flow
  service_interest   text null,
  lead_source        text null,   -- attribution label built by the existing utmTracking util
  status             text not null default 'new',
  session_id         uuid null references public.lead_sessions (id) on delete set null,

  -- last-touch attribution
  utm_source         text null,
  utm_medium         text null,
  utm_campaign       text null,
  utm_term           text null,
  utm_content        text null,
  gclid              text null,
  referrer_host      text null,

  -- first-touch attribution
  first_utm_source   text null,
  first_utm_medium   text null,
  first_utm_campaign text null,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint funnel_leads_status_check
    check (status in ('new', 'contacted', 'qualified', 'converted', 'closed'))
);

comment on table public.funnel_leads is
  'Lead record of record for acquisition-funnel leads (marketing/site leads). Distinct from `Learner`, which is the learning-record table.';
comment on column public.funnel_leads.phone_normalized is
  'Last 10 digits of the phone. UNIQUE — this is the lead dedupe key.';
comment on column public.funnel_leads.session_id is
  'Session that produced this lead. Nullable so a lead survives session cleanup.';

create index if not exists idx_funnel_leads_session_id
  on public.funnel_leads (session_id);
create index if not exists idx_funnel_leads_created_at
  on public.funnel_leads (created_at desc);
create index if not exists idx_funnel_leads_utm_source
  on public.funnel_leads (utm_source);

-- ---------------------------------------------------------------------------
-- lead_events
-- ---------------------------------------------------------------------------
create table if not exists public.lead_events (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.lead_sessions (id) on delete cascade,
  lead_id         uuid null references public.funnel_leads (id) on delete set null,
  event_name      text not null,
  occurred_at     timestamptz not null default now(),
  page_path       text null,
  properties      jsonb not null default '{}'::jsonb,
  correlation_id  uuid null,
  client_event_id text not null,
  created_at      timestamptz not null default now(),

  constraint lead_events_session_client_event_unique
    unique (session_id, client_event_id)
);

comment on table public.lead_events is
  'Append-only funnel event log. Retries are idempotent via (session_id, client_event_id).';
comment on column public.lead_events.client_event_id is
  'Client-supplied idempotency key. For lead_captured the server derives it as "capture:<lead_id>" so a lead can only ever have one success event.';
comment on column public.lead_events.lead_id is
  'Null for events that happened before the lead was captured. Server-derived only.';

create index if not exists idx_lead_events_event_name
  on public.lead_events (event_name);
create index if not exists idx_lead_events_lead_id
  on public.lead_events (lead_id);
create index if not exists idx_lead_events_occurred_at
  on public.lead_events (occurred_at desc);
create index if not exists idx_lead_events_session_time
  on public.lead_events (session_id, occurred_at desc);

-- Exactly one success event per lead, no matter how many sessions or retries.
create unique index if not exists idx_lead_events_one_capture_per_lead
  on public.lead_events (lead_id)
  where event_name = 'lead_captured';

-- ---------------------------------------------------------------------------
-- Circular FK closure: lead_sessions.lead_id -> funnel_leads.id
-- (added after both tables exist; no data is affected)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lead_sessions_lead_id_fkey'
  ) then
    alter table public.lead_sessions
      add constraint lead_sessions_lead_id_fkey
      foreign key (lead_id) references public.funnel_leads (id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS: enabled, zero policies, service-role only.
-- ---------------------------------------------------------------------------
alter table public.lead_sessions enable row level security;
alter table public.funnel_leads  enable row level security;
alter table public.lead_events   enable row level security;

revoke all on public.lead_sessions from anon, authenticated;
revoke all on public.funnel_leads  from anon, authenticated;
revoke all on public.lead_events   from anon, authenticated;

revoke all on public.lead_sessions from public;
revoke all on public.funnel_leads  from public;
revoke all on public.lead_events   from public;
