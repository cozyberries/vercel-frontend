-- Add discount tracking columns to orders and checkout_sessions tables.
-- discount_code: which promo code was applied (nullable — no discount if NULL)
-- discount_amount: INR amount deducted (0 by default)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_code   text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE checkout_sessions
  ADD COLUMN IF NOT EXISTS discount_code   text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;
