-- Add addon_ids column to booking table to track RTO services for RTO-only bookings
-- and course+RTO bookings. This allows the RTO team to track applications in the
-- LL pipeline when payment is approved.

alter table public.booking
  add column if not exists addon_ids uuid[] default '{}';

comment on column public.booking.addon_ids is 'Array of booking_addons IDs for RTO services (used for LL pipeline tracking)';