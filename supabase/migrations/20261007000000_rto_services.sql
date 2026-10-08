-- -----------------------------------------------------------------------------
-- RTO services as bookable add-ons (user-approved catalogue 2026-10-06).
-- The old generic "rto_assistance" add-on is deactivated (not deleted — history
-- keeps referencing it). Four contextual services are seeded; the booking
-- frontend offers only the subset matching each learner's licence branch, and
-- they are charged through the existing booking_addons -> booking -> payment
-- pipeline exactly like the old add-on.
-- -----------------------------------------------------------------------------

-- 1. Deactivate the legacy generic RTO add-on (kept for historical rows).
update public.booking_addons
set active = false, updated_at = now()
where code = 'rto_assistance' and active = true;

-- 2. Seed the contextual RTO services (idempotent by code).
insert into public.booking_addons (code, name, description, price, active, sort_order)
values
  (
    'rto_2w_ll_dl',
    '2W Learner''s + Driving Licence',
    'End-to-end help to get your 2-wheeler Learner''s Licence and then your 2-wheeler Driving Licence — application, documents and RTO test support.',
    3000,
    true,
    20
  ),
  (
    'rto_2w_dl',
    '2W Driving Licence (from Learner''s)',
    'We convert your existing Learner''s Licence into a 2-wheeler Driving Licence — application, documents and RTO test support.',
    2000,
    true,
    21
  ),
  (
    'rto_4w_ll_dl',
    '4W Learner''s + Driving Licence',
    'End-to-end help to get your 4-wheeler Learner''s Licence and then your 4-wheeler Driving Licence — application, documents and RTO test support.',
    4000,
    true,
    22
  ),
  (
    'rto_dl_address_change',
    'DL Address Change (Other State → Karnataka)',
    'We handle the transfer of your driving licence address to Karnataka — application, documents and RTO support.',
    3799,
    true,
    23
  )
on conflict (code) do nothing;