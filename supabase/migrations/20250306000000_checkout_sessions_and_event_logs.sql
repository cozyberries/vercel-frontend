-- ============================================================================
-- Migration: Checkout Sessions + Event Logs
-- Purpose: Defer order creation until after payment confirmation.
--          A checkout_session holds the cart/address/totals during payment.
--          event_logs tracks user activity for analytics.
-- ============================================================================

-- Table A: checkout_sessions
CREATE TABLE checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  shipping_address JSONB NOT NULL,
  billing_address JSONB,
  items JSONB NOT NULL,  -- [{id, name, price, quantity, image?, size?, color?, sku?}]
  subtotal NUMERIC NOT NULL,
  delivery_charge NUMERIC NOT NULL,
  tax_amount NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'INR',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | completed | expired
  order_id UUID REFERENCES orders(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sessions" ON checkout_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_checkout_sessions_user_status
  ON checkout_sessions(user_id, status);

-- Table B: event_logs
CREATE TABLE event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  session_id TEXT,
  event_type TEXT NOT NULL,
  event_data JSONB,
  page_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own events" ON event_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own events" ON event_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_event_logs_user_type
  ON event_logs(user_id, event_type);

CREATE INDEX idx_event_logs_created
  ON event_logs(created_at);

-- Update orders status check constraint to include 'verifying_payment'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'payment_pending',
    'verifying_payment',
    'payment_confirmed',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
    'refunded'
  )
);
