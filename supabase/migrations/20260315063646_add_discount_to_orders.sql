-- Add discount tracking columns to orders and checkout_sessions tables.
-- discount_code: which promo code was applied (nullable — no discount if NULL)
-- discount_amount: INR amount deducted (0 by default)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_code   text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE checkout_sessions
  ADD COLUMN IF NOT EXISTS discount_code   text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;

-- Conditional indexes to speed up discount analytics queries.
-- Only index rows that actually have a discount applied.
CREATE INDEX IF NOT EXISTS idx_orders_discount_code
  ON orders (discount_code)
  WHERE discount_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_discount_code
  ON checkout_sessions (discount_code)
  WHERE discount_code IS NOT NULL;

-- Check constraints to enforce non-negative discount amounts.
-- Uses DO blocks for idempotent semantics (PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_discount_amount_non_negative'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT chk_orders_discount_amount_non_negative CHECK (discount_amount >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_checkout_sessions_discount_amount_non_negative'
  ) THEN
    ALTER TABLE checkout_sessions
      ADD CONSTRAINT chk_checkout_sessions_discount_amount_non_negative CHECK (discount_amount >= 0);
  END IF;
END $$;
