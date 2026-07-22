-- Phase 6 review follow-up (I1): make impersonation_events FKs survive
-- deletion of the actor or target.
--
-- The `order_placed` audit row is written fire-and-forget from
-- /api/payments/confirm and /api/orders. If the admin (actor) or customer
-- (target) has been deleted between the session read and the audit insert,
-- a strict FK (ON DELETE NO ACTION) causes the insert to fail and the audit
-- row is silently dropped. Relax the constraint to ON DELETE SET NULL so
-- the audit row is preserved with NULL in place of the deleted user.
--
-- Columns are also relaxed to NULL. No existing reader assumes non-null
-- (Phase 7 admin-side list page is not shipped yet).

ALTER TABLE impersonation_events
  ALTER COLUMN actor_id DROP NOT NULL,
  ALTER COLUMN target_id DROP NOT NULL;

ALTER TABLE impersonation_events
  DROP CONSTRAINT IF EXISTS impersonation_events_actor_id_fkey;

ALTER TABLE impersonation_events
  ADD CONSTRAINT impersonation_events_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE impersonation_events
  DROP CONSTRAINT IF EXISTS impersonation_events_target_id_fkey;

ALTER TABLE impersonation_events
  ADD CONSTRAINT impersonation_events_target_id_fkey
    FOREIGN KEY (target_id) REFERENCES auth.users(id) ON DELETE SET NULL;
