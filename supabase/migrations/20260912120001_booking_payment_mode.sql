-- Payment-mode switch for the direct booking flow.
--
--   "test" => the payment edge functions approve every payment as success
--             (synthetic order id, no real Razorpay call, no signature check).
--   "live" => real Razorpay Orders API + HMAC-SHA256 signature verification.
--
-- Fail-closed: booking_flow parsing treats a missing/invalid payment_mode as
-- "not configured", so online booking is disabled until the admin sets it
-- explicitly. The seed here defaults new installs to "test" — flip to "live"
-- and set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET when going to production.

UPDATE app_settings
SET value = jsonb_set(value, '{payment_mode}', '"test"')
WHERE key = 'booking_flow'
  AND value ? 'enabled'
  AND NOT (value ? 'payment_mode');