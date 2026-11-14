-- =============================================================================
-- Phase 0 funnel — metric queries (PRD §1)
-- =============================================================================
-- Target: production Supabase `csnzgfzxnscumvjefpon`.
-- Run with the service role (SQL editor / Management API). Read-only.
--
-- Counting units are stated per query. Every query is scoped to a trailing
-- 30-day window; change the interval for a different period.
--
-- Tables:  public.lead_events      (one row per funnel event)
--          public.lead_sessions    (one row per browser session)
--          public.funnel_leads     (one row per captured lead)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- M1. Funnel drop-off by event
--     Units: occurrences (rows), sessions, leads.
-- -----------------------------------------------------------------------------
select event_name,
       count(*)                              as occurrences,
       count(distinct session_id)            as sessions,
       count(distinct lead_id)               as leads,
       min(occurred_at)                      as first_seen,
       max(occurred_at)                      as last_seen
from   public.lead_events
where  occurred_at >= now() - interval '30 days'
group  by event_name
order  by min(occurred_at);


-- -----------------------------------------------------------------------------
-- M2. Lead capture rate  (PRD §1 #1)
--     Units: DISTINCT SESSIONS (a session may retry the form).
--     Note: in Phase 0 the marketing site has no location input, so the
--     denominator only counts sessions that reached the location step.
-- -----------------------------------------------------------------------------
with s as (
  select session_id,
         bool_or(event_name = 'location_entered') as saw_location,
         bool_or(event_name = 'lead_captured')    as captured
  from   public.lead_events
  where  occurred_at >= now() - interval '30 days'
  group  by session_id
)
select count(*) filter (where captured)                              as captured_sessions,
       count(*) filter (where saw_location)                          as location_sessions,
       round(100.0 * count(*) filter (where captured)
             / nullif(count(*) filter (where saw_location), 0), 2) as capture_rate_pct
from   s;


-- -----------------------------------------------------------------------------
-- M3. Session conversion  (PRD §1 #3)
--     Units: DISTINCT SESSIONS with a captured lead that also converted.
-- -----------------------------------------------------------------------------
with s as (
  select session_id,
         bool_or(event_name = 'lead_captured')     as captured,
         bool_or(event_name = 'booking_confirmed') as confirmed
  from   public.lead_events
  where  occurred_at >= now() - interval '30 days'
  group  by session_id
)
select count(*) filter (where confirmed)                               as confirmed_sessions,
       count(*) filter (where captured)                                as captured_sessions,
       round(100.0 * count(*) filter (where confirmed)
             / nullif(count(*) filter (where captured), 0), 2)         as conversion_pct
from   s;


-- -----------------------------------------------------------------------------
-- M4. Ordered step-to-step drop-off (the PRD §4 funnel, left to right)
--     Units: DISTINCT SESSIONS reaching each step, as a % of ALL sessions.
--     The step order is the canonical PRD §4 order (hard-coded, not inferred
--     from timestamps — a visitor may legitimately re-enter a step).
-- -----------------------------------------------------------------------------
with steps(event_name, step_no) as (
  values
    ('home_viewed',              1),
    ('location_entered',         2),
    ('dl_status_selected',       3),
    ('course_list_viewed',       4),
    ('course_selected',          5),
    ('plan_page_viewed',         6),
    ('slots_viewed',             7),
    ('slot_selected',            8),
    ('lead_captured',            9),
    ('payment_option_selected', 10),
    ('payment_initiated',       11),
    ('payment_success',         12),
    ('booking_confirmed',       13)
),
ev as (
  select distinct session_id, event_name
  from   public.lead_events
  where  occurred_at >= now() - interval '30 days'
),
base as (
  select count(distinct session_id) as base_sessions from ev
)
select s.step_no,
       s.event_name,
       count(distinct e.session_id)                        as sessions_reaching_step,
       round(100.0 * count(distinct e.session_id)
             / nullif(b.base_sessions, 0), 2)              as pct_of_all_sessions
from   steps s
left   join ev  e on e.event_name = s.event_name
cross  join base b
group  by s.step_no, s.event_name, b.base_sessions
order  by s.step_no;


-- -----------------------------------------------------------------------------
-- M5. Expert-CTA split  (PRD §8 Q11 — "worth measuring the split from week one")
--     Units: taps (events), distinct sessions, distinct leads.
-- -----------------------------------------------------------------------------
select properties->>'cta_location'   as cta_location,
       count(*)                      as taps,
       count(distinct session_id)    as sessions,
       count(distinct lead_id)       as leads
from   public.lead_events
where  event_name = 'expert_contact_requested'
  and  occurred_at >= now() - interval '30 days'
group  by 1
order  by taps desc;


-- -----------------------------------------------------------------------------
-- M6. Attribution: captured leads by source / lead_source
--     Units: leads.
-- -----------------------------------------------------------------------------
select coalesce(source, 'unknown')     as source,
       coalesce(lead_source, 'unknown') as lead_source,
       count(*)                         as leads,
       count(*) filter (
         where lead_state in ('captured','slot_engaged','payment_attempted','converted')
       )                                 as engaged
from   public.funnel_leads
where  created_at >= now() - interval '30 days'
group  by 1,2
order  by leads desc;


-- -----------------------------------------------------------------------------
-- M7. Lead state + tier distribution  (PRD §4)
--     Units: leads.
-- -----------------------------------------------------------------------------
select lead_state,
       priority_tier,
       count(*)
from   public.funnel_leads
where  created_at >= now() - interval '30 days'
group  by 1,2
order  by 3 desc;


-- -----------------------------------------------------------------------------
-- M8. Integrity checks — every column MUST be 0.
-- -----------------------------------------------------------------------------
select
  (select count(*) from public.lead_events e
     where e.lead_id is null and e.event_name = 'lead_captured')            as captures_without_lead,
  (select count(*) from public.lead_events e
     where e.session_id not in (select id from public.lead_sessions))       as orphan_events,
  (select count(*) from public.lead_sessions s
     where s.lead_id is null)                                              as unlinked_sessions,
  (select count(*) from (select lead_id from public.lead_events
     where event_name = 'lead_captured' group by lead_id having count(*) > 1) x)
                                                                             as duplicate_captures,
  (select count(*) from public.lead_events e
     where e.event_name = 'lead_captured'
       and e.lead_id is not null
       and not exists (select 1 from public.funnel_leads l where l.id = e.lead_id))
                                                                             as captures_with_missing_lead;


-- -----------------------------------------------------------------------------
-- M9. Event volume by surface (marketing vs funnel) — QA / traffic split.
--     The surface is derived from the session's FIRST page path, because the
--     event taxonomy deliberately has no `surface` property (it would be a
--     free-text field the client could lie about).
--     Units: events.
-- -----------------------------------------------------------------------------
select case
         when s.first_page_path like '/book%' then 'funnel'
         else 'marketing'
       end                          as surface,
       e.event_name,
       count(*)                     as events,
       count(distinct e.session_id) as sessions
from   public.lead_events e
join   public.lead_sessions s on s.id = e.session_id
where  e.occurred_at >= now() - interval '30 days'
group  by 1,2
order  by 1, events desc;


-- -----------------------------------------------------------------------------
-- M10. Payment + booking drop-off (diagnostic for M3).
--      Units: DISTINCT SESSIONS at each payment/booking step.
--      `payment_failed` is 0 by construction while prod `payment_mode='test'`.
-- -----------------------------------------------------------------------------
with s as (
  select session_id,
         bool_or(event_name = 'payment_initiated')      as initiated,
         bool_or(event_name = 'payment_success')        as paid,
         bool_or(event_name = 'payment_failed')         as failed,
         bool_or(event_name = 'booking_confirmed')      as confirmed
  from   public.lead_events
  where  occurred_at >= now() - interval '30 days'
  group  by session_id
)
select count(*) filter (where initiated)                             as initiated_sessions,
       count(*) filter (where paid)                                  as paid_sessions,
       count(*) filter (where failed)                                as failed_sessions,
       count(*) filter (where confirmed)                             as confirmed_sessions,
       round(100.0 * count(*) filter (where paid)
             / nullif(count(*) filter (where initiated), 0), 2)     as initiation_to_payment_pct,
       round(100.0 * count(*) filter (where confirmed)
             / nullif(count(*) filter (where paid), 0), 2)           as payment_to_booking_pct
from   s;


-- -----------------------------------------------------------------------------
-- M11. Lead response SLA — time from capture to the first payment attempt.
--      Units: leads (one row per captured lead that attempted a payment).
-- -----------------------------------------------------------------------------
with caps as (
  select e.lead_id,
         min(e.occurred_at) as captured_at
  from   public.lead_events e
  where  e.event_name = 'lead_captured'
    and  e.occurred_at >= now() - interval '30 days'
  group  by e.lead_id
),
pays as (
  select e.lead_id,
         min(e.occurred_at) as first_payment_at
  from   public.lead_events e
  where  e.event_name = 'payment_initiated'
    and  e.occurred_at >= now() - interval '30 days'
  group  by e.lead_id
)
select count(*)                                             as captured_leads,
       count(p.first_payment_at)                            as leads_that_attempted_payment,
       round(avg(extract(epoch from (p.first_payment_at - c.captured_at)) / 60.0)::numeric, 1)
                                                           as avg_minutes_to_payment,
       round(percentile_cont(0.5) within group (
         order by extract(epoch from (p.first_payment_at - c.captured_at)) / 60.0
       )::numeric, 1)                                      as median_minutes_to_payment
from   caps c
left   join pays p on p.lead_id = c.lead_id;


-- -----------------------------------------------------------------------------
-- M12. Session lifecycle: session start -> location check -> capture form.
--      Units: DISTINCT SESSIONS in the last 30 days.
--      `funnel_session_started` is written once per NEW session (server-side),
--      `serviceability_check_started` opens a location check and
--      `location_entered` closes it, so check_success_pct is the real
--      location-lookup failure/drop-off rate. `lead_capture_started` is the
--      visitor engaging with a lead form; `lead_captured` is the commit.
-- -----------------------------------------------------------------------------
with s as (
  select session_id,
         bool_or(event_name = 'funnel_session_started')       as started,
         bool_or(event_name = 'serviceability_check_started') as check_started,
         bool_or(event_name = 'location_entered')             as check_resolved,
         bool_or(event_name = 'lead_capture_started')         as capture_started,
         bool_or(event_name = 'lead_captured')                as captured
  from   public.lead_events
  where  occurred_at >= now() - interval '30 days'
  group  by session_id
)
select count(*) filter (where started)        as sessions_started,
       count(*) filter (where check_started)  as sessions_with_location_check,
       count(*) filter (where check_resolved) as sessions_location_resolved,
       count(*) filter (where capture_started) as sessions_with_capture_form,
       count(*) filter (where captured)       as sessions_captured,
       round(100.0 * count(*) filter (where check_resolved)
             / nullif(count(*) filter (where check_started), 0), 2) as check_success_pct,
       round(100.0 * count(*) filter (where captured)
             / nullif(count(*) filter (where capture_started), 0), 2) as capture_form_completion_pct,
       round(100.0 * count(*) filter (where captured)
             / nullif(count(*) filter (where started), 0), 2)          as session_capture_pct
from   s;


-- -----------------------------------------------------------------------------
-- M12b. Envelope integrity — every event written AFTER the envelope rollout
--       must carry `properties.schema_version` and `properties.surface`
--       (both injected server-side; a client can never set them). Units: rows.
--       Both columns MUST be 0 for `now() - 1 day` onwards.
-- -----------------------------------------------------------------------------
select count(*) filter (where properties->>'schema_version' is null) as missing_schema_version,
       count(*) filter (where properties->>'surface' is null or properties->>'surface' = '')
                                                                     as missing_surface,
       count(*)                                                      as events_in_window
from   public.lead_events
where  occurred_at >= now() - interval '1 day';

