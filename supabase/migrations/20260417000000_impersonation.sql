-- Admin order-on-behalf: impersonation audit
-- Phase 1 foundation. See docs/superpowers/specs/2026-04-17-admin-order-on-behalf-design.md

ALTER TABLE orders
  ADD COLUMN placed_by_admin_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX orders_placed_by_admin_id_idx
  ON orders (placed_by_admin_id)
  WHERE placed_by_admin_id IS NOT NULL;

CREATE TABLE impersonation_events (
  id           bigserial PRIMARY KEY,
  actor_id     uuid NOT NULL REFERENCES auth.users(id),
  target_id    uuid NOT NULL REFERENCES auth.users(id),
  event_type   text NOT NULL CHECK (event_type IN ('start','stop','order_placed','expired')),
  order_id     uuid NULL REFERENCES orders(id) ON DELETE SET NULL,
  ip           inet NULL,
  user_agent   text NULL,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX impersonation_events_actor_created_idx
  ON impersonation_events (actor_id, created_at DESC);
CREATE INDEX impersonation_events_target_created_idx
  ON impersonation_events (target_id, created_at DESC);

ALTER TABLE impersonation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY impersonation_events_admin_read
  ON impersonation_events FOR SELECT
  USING (auth.jwt() -> 'app_metadata' ->> 'role' IN ('admin','super_admin'));
-- Writes are service-role only; no INSERT/UPDATE/DELETE policy by design.
