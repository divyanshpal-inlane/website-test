-- =============================================================================
-- Direct customer booking flow — seed data
--  1. booking_flow app_settings gate (disabled by default; flip enabled to true)
--  2. booking_addons catalogue (RTO Assistance — DB-driven, extendable)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Flow gate + rules. Keep comments in sync with get-booking-config defaults.
-- -----------------------------------------------------------------------------
insert into public.app_settings (key, value)
values (
  'booking_flow',
  '{
    "enabled": false,
    "gateway": "razorpay",
    "hold_minutes": 30,
    "max_slots_per_booking": 20,
    "booking_days_ahead": 14,
    "slot_grid_minutes": 30,
    "slot_duration_minutes": 60,
    "slot_start": "06:00",
    "slot_end": "20:00",
    "female_instructor_mode": "preference",
    "installment_modes": ["full", "first_half"]
  }'::jsonb
)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Add-on catalogue. Only RTO Assistance is seeded for now; new add-ons and
--    price changes are plain inserts/updates here — no code changes needed.
--    course_addons(course_id, addon_id, included) can be populated separately
--    with:  insert into public.course_addons (course_id, addon_id, included)
--             select c.id, a.id, false from "Courses" c, booking_addons a
--             where c.name = '<course name>' and a.code = 'rto_assistance';
-- -----------------------------------------------------------------------------
insert into public.booking_addons (code, name, description, price, active, sort_order)
values (
  'rto_assistance',
  'RTO Assistance',
  'We help with your learner licence and driving licence end to end - application, documents and RTO test support, so you never have to run around.',
  4000,
  true,
  10
)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Instructor gender is nullable free text. Flip it on for availability:
--    update public."Instructor" set gender = 'female' where <instructor> = '<name>';
-- -----------------------------------------------------------------------------