-- Phase 0 baseline funnel metrics. Run via SQL editor (service role).
-- Funnel = distinct sessions reaching each step, last 30 days.

-- 1. Step reach + conversion from home_viewed
with steps(ord, event_name) as (values
  (1,'home_viewed'),(2,'location_entered'),(3,'dl_status_selected'),
  (4,'course_list_viewed'),(5,'price_unlock_attempted'),(6,'lead_captured'),
  (7,'slots_viewed'),(8,'slot_selected'),(9,'course_selected'),
  (10,'plan_page_viewed'),(11,'payment_option_selected'),
  (12,'payment_initiated'),(13,'payment_success'),(14,'booking_confirmed')),
reach as (
  select s.ord, s.event_name, count(distinct e.session_id) as sessions
  from steps s
  left join public.lead_events e
    on e.event_name = s.event_name and e.occurred_at >= now() - interval '30 days'
  group by s.ord, s.event_name)
select ord, event_name, sessions,
  round(100.0 * sessions / nullif(first_value(sessions) over (order by ord), 0), 1) as pct_of_home,
  round(100.0 * sessions / nullif(lag(sessions) over (order by ord), 0), 1) as pct_of_prev
from reach order by ord;

-- 2. Leads by source and day
select date_trunc('day', created_at) as day, source, count(*) as leads
from public.funnel_leads
where created_at >= now() - interval '30 days'
group by 1, 2 order by 1 desc, 3 desc;

-- 3. Lead -> booking conversion (sessions with lead_captured that later booked)
select count(distinct session_id) filter (where event_name = 'lead_captured') as leads,
       count(distinct session_id) filter (where event_name = 'booking_confirmed') as booked
from public.lead_events where occurred_at >= now() - interval '30 days';

-- 4. Downstream delivery health
select cratio_sync_status, count(*) from public.funnel_leads group by 1;
