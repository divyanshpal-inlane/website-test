insert into public.app_settings (key, value, description)
values (
  'booking_flow',
  '{
    "enabled": true,
    "gateway": "razorpay",
    "hold_minutes": 30,
    "max_slots_per_booking": 20,
    "booking_days_ahead": 14,
    "slot_grid_minutes": 30,
    "slot_duration_minutes": 60,
    "slot_start": "06:00",
    "slot_end": "20:00",
    "female_instructor_mode": "preference",
    "installment_modes": ["full", "first_half"],
    "payment_mode": "test"
  }'::jsonb,
  'Direct booking flow enabled for local testing'
)
on conflict (key) do update set value = excluded.value, updated_at = now();

insert into public."Serviceable_Areas" (id, name, active)
values
  ('00000000-0000-4000-8000-000000000001', 'Indiranagar', true),
  ('00000000-0000-4000-8000-000000000002', 'Koramangala', true),
  ('00000000-0000-4000-8000-000000000003', 'Whitefield', true)
on conflict (name) do update set active = true;

insert into public."Courses" (id, name, code, duration, total_lessons, price, enabled, description, is_recommended)
values
  ('00000000-0000-4000-8000-000000000011', 'Driving Masterclass', 1, 10, 10, 6500, true, '10 one-to-one practical classes · Pick-up & drop included', true),
  ('00000000-0000-4000-8000-000000000012', 'Brush Up', 2, 8, 8, 5500, true, '8 practical classes · Best for existing drivers building confidence', false)
on conflict (id) do update set
  name = excluded.name,
  code = excluded.code,
  duration = excluded.duration,
  total_lessons = excluded.total_lessons,
  price = excluded.price,
  enabled = true,
  description = excluded.description,
  is_recommended = excluded.is_recommended;

-- The old mock course set is no longer used.
delete from public."Courses"
  where id = '00000000-0000-4000-8000-000000000013';

insert into public.booking_addons (id, code, name, description, price, active, sort_order)
values (
  '00000000-0000-4000-8000-000000000021',
  'rto_assistance',
  'RTO Assistance',
  'Learner licence and driving licence support - application, documents and RTO test help.',
  4000,
  true,
  10
)
on conflict (code) do update set
  id = excluded.id,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  active = true,
  sort_order = 10;

insert into public.course_addons (course_id, addon_id, included)
values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', false),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000021', false)
on conflict (course_id, addon_id) do update set included = excluded.included;

insert into public."Instructor" (
  id_instructor, name, phone, email, "DL_number", car_make, car_mode, car_license,
  experience, enabled, areas, address, radius, latitude, longitude, car_fuel_type,
  status, gender
)
values
  (
    '00000000-0000-4000-8000-000000000031', 'Rajesh Kumar Menon', '9811111111',
    'rajesh.menon@inlane.in', 'KA03DL0000031', 'Maruti Suzuki', 'Swift Dzire', 'KA03AB1234',
    8, true, ARRAY['Indiranagar', 'Koramangala'], 'Indiranagar, Bengaluru', 8,
    12.9787000, 77.6408000, 'petrol', 'active', 'male'
  ),
  (
    '00000000-0000-4000-8000-000000000032', 'Arjun Nair', '9822222222',
    'arjun.nair@inlane.in', 'KA03DL0000032', 'Hyundai', 'i20', 'KA03CD5678',
    6, true, ARRAY['Koramangala', 'Whitefield'], 'Koramangala, Bengaluru', 10,
    12.9352000, 77.6245000, 'petrol', 'active', 'male'
  ),
  (
    '00000000-0000-4000-8000-000000000033', 'Priya Sharma', '9833333333',
    'priya.sharma@inlane.in', 'KA03DL0000033', 'Maruti Suzuki', 'WagonR', 'KA03EF9012',
    5, true, ARRAY['Indiranagar', 'Koramangala', 'Whitefield'], 'Indiranagar, Bengaluru', 12,
    12.9782000, 77.6428000, 'petrol', 'active', 'female'
  )
on conflict (id_instructor) do nothing;

insert into public."Learner" (
  id, name, phone, city, area, pincode, "has_a_DL", two_wheeler_license_state,
  has_two_wheeler_license, pick_up_location, needs_scheduling, enabled, onboarding_completed
)
values
  (
    '00000000-0000-4000-8000-000000000041', 'Test Learner DL', '9876543210',
    'Bengaluru', 'Indiranagar', '560038', true, 'active_dl', true,
    '12th Main, Indiranagar', false, true, true
  ),
  (
    '00000000-0000-4000-8000-000000000042', 'Test Learner LL', '9876543211',
    'Bengaluru', 'Koramangala', '560034', false, 'll_only', true,
    '80 Feet Road, Koramangala', true, true, true
  )
on conflict (phone) do nothing;