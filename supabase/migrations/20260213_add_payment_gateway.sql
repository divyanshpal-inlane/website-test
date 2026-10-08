-- Add gateway column to payment table to track which payment gateway was used
ALTER TABLE payment ADD COLUMN IF NOT EXISTS gateway TEXT DEFAULT 'icici' CHECK (gateway IN ('icici', 'razorpay'));

-- Add index for faster queries filtering by gateway
CREATE INDEX IF NOT EXISTS idx_payment_gateway ON payment(gateway);
