-- Phase 6: Persist admin-on-behalf attribution on checkout_sessions
--
-- Rationale: an admin may create a checkout session under shadow mode then
-- leave; the customer (or a different actor) may later confirm payment. We
-- need the admin attribution to survive that gap so the resulting order row
-- is correctly tagged via orders.placed_by_admin_id and the audit trail is
-- preserved.

ALTER TABLE checkout_sessions
  ADD COLUMN placed_by_admin_id uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX checkout_sessions_placed_by_admin_id_idx
  ON checkout_sessions (placed_by_admin_id)
  WHERE placed_by_admin_id IS NOT NULL;
