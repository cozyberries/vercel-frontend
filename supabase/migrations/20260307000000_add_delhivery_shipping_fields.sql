-- Add Delhivery shipping fields to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delhivery_waybill VARCHAR(30) UNIQUE,
  ADD COLUMN IF NOT EXISTS delhivery_order_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS delhivery_estimated_delivery DATE,
  ADD COLUMN IF NOT EXISTS shipment_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipment_creation_error TEXT,
  ADD COLUMN IF NOT EXISTS shipment_creation_attempts INT DEFAULT 0;

-- Index for tracking lookups by waybill
CREATE INDEX IF NOT EXISTS idx_orders_delhivery_waybill
  ON orders(delhivery_waybill)
  WHERE delhivery_waybill IS NOT NULL;
