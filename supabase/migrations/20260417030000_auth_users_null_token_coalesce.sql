-- Repair auth.users rows where token/change text columns are NULL.
--
-- WHY
--   GoTrue's `listUsers` uses `database/sql` to scan rows into Go strings.
--   When any of these columns are NULL, the scan fails with:
--     "sql: Scan error on column index 3, name \"confirmation_token\":
--      converting NULL to string is unsupported"
--   which bubbles up to the Supabase Auth Admin API as:
--     "Database error finding users" (HTTP 500, code: unexpected_failure).
--
--   This breaks our admin impersonation flow (user search + duplicate-check
--   on user creation) because both depend on `supabase.auth.admin.listUsers`.
--
-- SCOPE
--   Some older rows in this project (created by legacy tooling or manual
--   auth-app seeds) were saved with NULL in these columns. Newer Supabase
--   writes store empty strings instead, so the fix is a one-shot COALESCE.
--   Safe to re-run; NO-OP if no NULLs exist.
--
-- SAFETY
--   - Updates only auth.users rows that actually need repair.
--   - Does not alter passwords, roles, metadata, identities, or sessions.
--   - Does not touch email_confirmed_at / phone_confirmed_at / etc.

UPDATE auth.users
SET
  confirmation_token         = COALESCE(confirmation_token, ''),
  recovery_token             = COALESCE(recovery_token, ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  email_change               = COALESCE(email_change, ''),
  phone_change               = COALESCE(phone_change, ''),
  phone_change_token         = COALESCE(phone_change_token, '')
WHERE
     confirmation_token         IS NULL
  OR recovery_token             IS NULL
  OR email_change_token_new     IS NULL
  OR email_change_token_current IS NULL
  OR email_change               IS NULL
  OR phone_change               IS NULL
  OR phone_change_token         IS NULL;
