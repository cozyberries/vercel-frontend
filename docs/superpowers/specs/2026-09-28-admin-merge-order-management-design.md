# Admin merge: order management into the storefront

**Date:** 2026-09-28
**Status:** Approved design, pending implementation plan
**Decision owners:** Abdul (product), this spec (technical)

## Goal

Merge the only in-use capability of the admin app (`../cozyberries-admin/`,
admin.cozyberries.com, port 4000) — **order management** — into this storefront
repo, then delete the admin app entirely: repo, Vercel project, and subdomain.
One repo, one deployment, one identity system.

## Scope

**Carried over** (rebuilt to this repo's conventions, not copied):

1. **Orders list + status updates** — the admin `/orders` page: browse all
   orders, filter, change status, set tracking, add delivery notes.
2. **Delhivery shipment + label** — create/cancel shipments at Delhivery,
   print the shipping label, live tracking panel.
3. **Delhivery webhook pipeline** — Delhivery scan events → `webhook_events`
   queue → QStash-driven processor → admin notification rows.

**Deliberately dropped:**

- **Admin order creation** (`OrderForm`) — redundant with this repo's
  impersonation / on-behalf checkout flow.
- **Order hard-delete** — the admin `DELETE /api/orders/[id]` hard-deleted
  orders, items and payments with no transaction. Not ported: `cancelled` /
  `refunded` statuses plus the `orders_on_status_change` trigger already
  handle the lifecycle, and deletion would break the GST invoice-number
  audit trail.
- **Orphan `payments/[id]` PATCH** — nothing in the admin UI called it;
  refunds remain a status transition.
- All non-order features: analytics dashboard, product management, user
  management, expenses, `/setup`, `create-admin`, admin PWA pieces.

## Decisions (approved 2026-09-28)

| Decision | Choice |
|---|---|
| Admin auth | Supabase session + `app_metadata.role` (`admin`/`super_admin`), same as `/admin/pickup-orders`. The `admin_users` bcrypt login, custom JWT and `admin_session` cookie are not ported. |
| `admin_users` table | Dropped from the live DB by migration once the merge ships. |
| Domain | admin.cozyberries.com DNS record and the admin Vercel project are deleted. No redirect. |
| Approach | Convention-first port: backend libs lifted nearly verbatim, routes and UI rewritten to storefront patterns. |

## Section 1 — Pages

### `/admin/orders`

Built like `/admin/pickup-orders`: client-side `useAuth()` + role gate
(no middleware — this repo has none), shadcn/ui, TanStack Query hooks in
`hooks/useApiQueries.ts`. Single page with expandable rows/dialogs.

Features (parity with `OrderManagement.tsx` minus the drops):

- Order list with status + fulfilment filters, text search, pagination.
- Status changes via a whitelist (see Section 2).
- Tracking number entry, carrier display, delivery notes.
- Delhivery actions: create shipment, cancel shipment, open label.
- Live tracking panel per shipped order.
- Link to the existing invoice route (`/api/orders/[id]/invoice`).
- Admin notifications panel/badge: shipment-update notifications
  (`user_id IS NULL` rows) surface here rather than on a separate page.

### `/admin/print/label/[orderId]`

Server-rendered Delhivery label for printing. Admin-gated. Port of the
admin app's `/print/label/[orderId]`.

## Section 2 — API routes

All admin routes follow the repo's admin-gated service-role shape:
`getUser()` → `isAdmin()` → only then create the service-role client;
every write scoped by the row id the admin acted on.

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/orders` | GET | List orders: filters (status, fulfilment, search), pagination. |
| `/api/admin/orders/[id]` | GET | Order detail with items, payment, shipment fields. |
| `/api/admin/orders/[id]` | PATCH | Status (whitelisted), `tracking_number`, `carrier_name`, `delivery_notes`, dates. |
| `/api/admin/orders/[id]/shipment` | POST | Create shipment at Delhivery; writes `tracking_number`, `carrier_name='Delhivery'`. |
| `/api/admin/orders/[id]/shipment` | DELETE | Cancel shipment at Delhivery; clears/annotates shipment fields. |
| `/api/admin/shipping/label` | GET | Fetch label PDF/packing slip data for the print page. |
| `/api/admin/shipping/tracking` | GET | Live Delhivery tracking, Upstash-cached. Reuses the same Delhivery pull plumbing as the customer route. |
| `/api/admin/notifications` | GET | List admin-broadcast notifications (`user_id IS NULL`). |
| `/api/admin/notifications/[id]` | PATCH | Mark read. |
| `/api/webhooks/delhivery` | POST | Delhivery scan-event intake. Verifies `x-delhivery-token` against `DELHIVERY_WEBHOOK_TOKEN`; inserts into `webhook_events`. No session (external caller); the token is the authorisation. |
| `/api/internal/webhooks/delhivery/process` | POST | Queue processor. QStash signature (or `INTERNAL_JOB_TOKEN` HMAC) verified; claims events via `claim_webhook_events` RPC, writes notification rows. |

### Status semantics

- PATCH status whitelist = the storefront's full status set **including
  `verifying_payment`** (which the admin app's list omitted).
- Status writes go through the DB unmodified so `orders_on_status_change`
  (security definer) keeps sole ownership of stock commit/return and GST
  invoice numbering on paid/unpaid transitions. No app-level duplication.
- Marking an order paid from `/admin/orders` is legitimate post-merge —
  this page *is* "the admin app" that CLAUDE.md's "only the Telegram ✅
  button (or the admin app) makes an order paid" rule refers to.
- No DELETE route exists for orders.

### CLAUDE.md service-role register

The admin-gated shape already exists in CLAUDE.md's list of five approved
service-role uses. The new routes fall under it; the webhook intake +
processor routes are added to the register explicitly (token/signature is
the authorisation, service-role writes limited to `webhook_events` and
`notifications`).

## Section 3 — Lib & backend logic

- **Port nearly verbatim:** `lib/delhivery/{client,config,types}.ts`,
  `lib/services/webhook-processor.ts`, `lib/services/notification-service.ts`
  (adapted to this repo's `lib/services/cache.ts`), relevant types from
  `lib/types/{order,delhivery,notifications}.ts`.
- **One required fix:** the admin `lib/delhivery/config.ts` throws at module
  import when env vars are missing. It becomes lazy accessors (the
  `getJwtSecret()` pattern): nothing reads Delhivery env at module load.
- **Env var unification:** keep the storefront's existing `DELIVERY_API_KEY`
  and `DELHIVERY_BASE_URL`. Add three server-only vars:
  `DELHIVERY_WAREHOUSE_NAME`, `DELHIVERY_WEBHOOK_TOKEN`, `INTERNAL_JOB_TOKEN`.
  The admin app's aliases (`DELHIVERY_API_TOKEN`, `DELHIVERY_API_BASE_URL`)
  are not carried over.
- **Script:** port `scripts/qstash-upsert-delhivery-processor-schedule.ts`
  so the QStash processor schedule can be (re)pointed with one command.
- **Cache keys:** the admin app already used the storefront's
  `user:orders:*` / `user:order:*` key shapes, so existing invalidation
  carries over; admin order writes must invalidate those keys the same way
  storefront routes do.

## Section 4 — Database

One idempotent consolidation migration in `supabase/migrations/`:

- Brings `webhook_events`, the `claim_webhook_events` RPC and
  `delhivery_tracking_summary` under this repo's migration history
  (`CREATE ... IF NOT EXISTS` — these objects already exist in the live DB
  from the admin repo's migrations).
- **Tier declaration:** `webhook_events` is **admin/internal** — no grants,
  no policies, service-role only. `claim_webhook_events` is
  `SECURITY DEFINER` with `SET search_path = ''` and
  `REVOKE ALL ... FROM anon, authenticated`.
- Drops `admin_users` (and any indexes/functions that reference it).
- Gated by `npm run db:lint` and `npm run db:probe` before merge, per
  convention.

After this, `cozyberries-admin/database/migrations/` ceases to exist and
`supabase/migrations/` is the single source of truth.

## Section 5 — Cutover & teardown (ordered)

1. Ship the merged code to production; set `DELHIVERY_WAREHOUSE_NAME`,
   `DELHIVERY_WEBHOOK_TOKEN`, `INTERNAL_JOB_TOKEN` on the storefront
   Vercel project.
2. Repoint the Delhivery webhook URL to
   `https://cozyberries.in/api/webhooks/delhivery`; run the QStash script
   to repoint the processor schedule.
3. Verify end-to-end: one scan event (test or real) flows through
   webhook intake → queue → processor → notification visible on
   `/admin/orders`.
4. Run the `admin_users` drop migration.
5. Delete the admin Vercel project (`prj_jb2I2WJeK5whNkcKN6ooEU9rL6xO`)
   and the admin.cozyberries.com DNS record.
6. Delete the admin repo — local checkout and GitHub — after taking a
   final `git bundle` archive as a safety net.
7. Update CLAUDE.md: remove the sibling-repo section and stale rules,
   add the new routes and env vars. Update project memory.

## Section 6 — Testing

- **Vitest (required):**
  - PATCH status whitelist: rejects unknown statuses, accepts
    `verifying_payment`.
  - Webhook processor: event claiming, notification creation,
    idempotency on re-delivery.
  - Delhivery config: lazy loading — importing the module with missing
    env vars does not throw; calling the accessor does.
  - Webhook intake: bad/missing `x-delhivery-token` → 401, no insert.
- **DB:** `db:lint` + `db:probe` on the consolidation migration.
- **Playwright:** skipped per standing preference. The admin pages reuse
  the proven `/admin/pickup-orders` gating pattern.

## Non-goals

- No change to customer-facing order tracking
  (`/api/shipping/order-tracking`), the Telegram confirmation flow,
  pickup orders, invoices, or the catalog pipeline.
- No new identity features; roles remain `customer`/`admin`/`super_admin`
  in `app_metadata.role`.
- No middleware reintroduction; gating stays per-page/per-route.
