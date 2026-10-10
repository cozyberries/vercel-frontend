# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## This Repo's Role

This is the **public-facing storefront** for CozyBerries (cozyberries.com, port 3000).
Customers browse products, manage their cart, checkout, pay via UPI, and track orders here.

Admin order management lives in this repo too, under one `/admin` section (`app/admin/layout.tsx` gates every route on `getUser()` + `isAdmin()` and wraps pages in `components/admin/AdminShell.tsx`; pages are built from `components/admin/kit/*`): `/admin` (action counts), `/admin/orders`, `/admin/pickup-orders`, `/admin/on-behalf-orders`, `/admin/stall-refills`, `/admin/stock`, `/admin/sales-register`, `/admin/retail`, `/admin/impersonate`, `/admin/admins` (`super_admin` only). The former admin app (admin.cozyberries.com) was merged here on 2026-09-28 and then deleted. Admin identity is
`auth.users.app_metadata.role` only — the old `admin_users` bcrypt login is gone.

The pre-merge custom JWT layer (`JWT_SECRET`, `lib/jwt-auth.ts`, `/api/auth/generate-token`, the auth provider's `jwtToken`) was removed on 2026-09-30 — its only consumer was the deleted admin app's API. `SUPABASE_JWT_SECRET` (Supabase's own) is unrelated and stays.
`SUPABASE_SERVICE_ROLE_KEY` is server-side only, and only for privileged operations that cannot be expressed under RLS. Every such route must (1) verify the user session with `getUser()` first and (2) scope every query by `user_id`. Six shapes qualify, and nothing else does:
- **Avoiding RLS/GRANT drift on user-owned rows** — the notifications API (`/api/notifications`).
- **Compensating deletes after a failed transaction** — rolling back a half-written order once the caller's own RLS-visible insert has already been confirmed (`/api/orders`, `/api/payments/confirm`).
- **Writes to service-role-only tables** — tables in the admin/internal tier that hold PII and grant `anon`/`authenticated` nothing (`recent_activities` via `/api/activities`).
- **Admin-gated routes** — `/api/admin/*` (impersonation, on-behalf orders, stall pickups, admin customer creation, orders list/edit, shipments, tracking, broadcast notifications, admins (super_admin via requireSuperAdmin()), dashboard/actions, dashboard/sales, stock, sales-register, retail consignment routes). `getUser()` then `isAdmin()` must both pass before the service-role client is created, and every write is scoped by the row id the admin acted on.
- **Signed public bill links** — `GET /bill/[orderId]/[sig]` only. There is no session: the HMAC over that exact order id (`INVOICE_LINK_SECRET`, compared with `timingSafeEqual`) is verified first, and the service role then reads that one order, read-only. The signature, not the client, is what authorises the id; never reuse this shape for anything that writes.
- **Signed webhook intake** — `POST /api/webhooks/delhivery` (the `x-delhivery-token`
  header, compared constant-time, is the authorisation) and
  `POST /api/internal/webhooks/delhivery/process` (QStash signature or
  `INTERNAL_JOB_TOKEN` HMAC). No session exists; writes are limited to
  `webhook_events` and broadcast `notifications` rows (`user_id IS NULL`).

Never reach for it to skip writing a policy, and never let a client-supplied id be the scope key.
`IMPERSONATION_SIGNING_SECRET` signs/verifies the `acting_as` cookie used by admin-order-on-behalf. Server-only, 32+ random bytes, distinct from the other secrets.
`INVOICE_LINK_SECRET` signs the public `/bill/<orderId>/<sig>` PDF links sent to customers on WhatsApp (`lib/invoice/bill-link.ts`). Server-only, 32+ characters, distinct from the other secrets. Rotating it revokes every bill link ever sent.

## Commands

```bash
# Development
npm run dev          # Start dev server on port 3000
npm run catalog:rebuild            # POST a full rebuild event (or -- --slug=<slug>)
npm run qstash:setup               # (once) create the nightly full-rebuild schedule
npm run qstash:schedule-delhivery  # (once) upsert the Delhivery processor schedule
npm run catalog:verify -- --url=https://cozyberries.in   # post-deploy checks

# Build & Production
npm run build        # Build for production
npm run start        # Start production server

# Code Quality
npm run lint         # Run ESLint (Next.js config)

# Testing — every bug gets an automated test; no manual verification
npm run test:unit                        # vitest (node + jsdom component tests)
npm run test:unit:coverage               # vitest with v8 coverage summary
npm test                                 # Playwright, chromium project (needs a server on :3000)
npm run test:catalog                     # catalog + page-coverage specs only
npm run test:e2e:prod                    # catalog/page/homepage specs against https://cozyberries.in
npx playwright test tests/foo.spec.ts    # Single test file
npm run db:test-orders                   # customer session can place an order (rolled back)
npm run db:test-pickup                   # stall-pickup trigger + guard SQL tests (rolled back)
npm run db:test-refills                  # stall-refills table + functions SQL tests (rolled back)
npm run db:test-split-frocks             # Frocks → four style categories migration (rolled back)
npm run db:test-category-data            # Girls Coord Sets gender + category descriptions fix (rolled back)
npm run db:test-overrides                # admin price-override table + note backfill SQL tests (rolled back)
npm run db:test-sales-register           # invoice_voided_at trigger, guard and invoice-number backfill (rolled back)
npm run db:test-retail                   # retail consignment tables + functions SQL tests (rolled back)
npm run db:test-sales-ranking            # product_sales_ranks table + refresh triggers SQL tests (rolled back)
```

## Architecture

### Stack
- **Next.js 15** App Router with TypeScript
- **Supabase** — Auth (SSR) + PostgreSQL database
- **TanStack Query v5** + Axios for data fetching with request deduplication
- **Context API** for client-side state (cart, wishlist, auth, rating, theme)
- **shadcn/ui** + Tailwind CSS for UI components
- **Cloudinary** for image optimization (CDN + q_auto/f_auto)
- **Upstash Redis** + localStorage for caching

### State Management Layers
1. **TanStack Query** (`hooks/useApiQueries.ts`) — server state, API caching (1min staleTime), deduplication
2. **Axios deduplication** (`lib/services/api.ts`) — in-flight request deduplication (50ms cleanup window) catches requests from providers that bypass React Query
3. **Context API** — local state: `CartContext`, `WishlistContext`, `SupabaseAuthContext`, `RatingContext`, `ThemeContext`
4. **Supabase** — real-time auth via `onAuthStateChange()`, user data via `auth.users` (no custom profile tables)

### Route Structure
```
app/
  (public)    /  /products  /about  /register
  (protected) /profile  /checkout  /complete-profile
  /payment/[orderId]         # Custom UPI payment flow
  /admin                     # Admin home: action counts (Redis 60s) + sales dashboard (Redis 300s per range)
  /admin/stall-refills       # Admin: what sold today/yesterday, shelf refill ticks
  /admin/stock               # Admin: stock on hand, restock next, not selling, size gaps (live)
  /admin/sales-register      # Admin: monthly GST sales register preview + .xlsx for the CA (live)
  /admin/retail              # Admin: consignment shops, challans, monthly sales, returns, payments
  /admin/orders              # Admin order management (server-gated by role)
  /admin/impersonate         # Find or create a customer, then act as them
  /admin/admins              # super_admin: list, add, remove admins (role in app_metadata)
  /admin/print/label/[orderId]  # Delhivery label print page
  /api/products/*            # Product data APIs
  /api/payments/*            # UPI link generation + confirmation
  /api/admin/orders/*        # Admin orders list/edit + shipment create/cancel
  /api/admin/shipping/tracking  # Admin live Delhivery tracking (Redis 90s cache)
  /api/admin/notifications/*    # Broadcast (user_id null) shipment-scan notifications
  /api/admin/admins/*        # super_admin-gated role changes
  /api/admin/dashboard/actions
  /api/admin/dashboard/sales # ?range=30d|3m|12m|all; aggregates only, no customer fields
  /api/admin/stock           # live stock metrics; no cache, no customer fields
  /api/admin/sales-register  # ?month=YYYY-MM JSON; /download → .xlsx; live, no cache
  /api/admin/retail/*        # shops, drafts, issue/cancel, PDFs, sales sheet, payments, discount rates (admin-gated)
  /api/shipping/pincode-check   # Delhivery serviceability check
  /api/shipping/order-tracking  # Delhivery package tracking (auth + orderId; proxies carrier)
  /api/webhooks/delhivery    # Delhivery scan intake (x-delhivery-token)
  /api/internal/webhooks/delhivery/process  # QStash-signed queue processor
  /api/catalog               # Static snapshot for browsers (revalidated on change)
  /api/catalog/events        # Supabase change webhook (x-catalog-secret)
  /api/catalog/rebuild       # QStash-signed / cron rebuild job
  /api/search                # Redis Search ranking
  /api/health/catalog        # Catalog health (version, age, counts)
```

### Auth Flow
- `middleware.ts` has been removed — there is no route-level auth enforcement. No route is middleware-protected (including `/checkout` and `/complete-profile`); the previous phone-required-before-checkout redirect is also gone.
- Any auth gating (e.g. `/orders`, `/profile` account-editing content) is enforced client-side per-page via `useAuth()`/`requireAuthForIntent`, not centrally.
- Roles: `customer`, `admin`, `super_admin`
- **All user data lives in `auth.users`** — no custom `profiles` or `user_profiles` tables:
  - `auth.users.phone` — contact phone (set via admin API)
  - `auth.users.app_metadata.role` — user role (admin-write-only, not user-writable)
  - `auth.users.user_metadata.full_name` / `.avatar_url` — display name and avatar
- Role checked client-side via `session.user.app_metadata.role` (from JWT, zero DB queries)
- Role checked in RLS via `auth.jwt() -> 'app_metadata' -> 'role'` (zero DB lookups)
- All profile writes go through `supabase.auth.admin.updateUserById()` (server-side only)
- Profile auto-created on signup via API route (`/api/users/create-profile`)
- **Email confirmation**: To send "Check your email" confirmation links, enable **Confirm email** in Supabase Dashboard → Authentication → Providers → Email, and add your site URL (e.g. `http://localhost:3000/auth/callback`) to Redirect URLs. For reliable delivery, configure SMTP in Project Settings → Auth.
- `POST /api/auth/verifynow/send|verify` accept `intent: "link"`: a signed-in user attaches a verified phone (`/profile#phone`), which is how Google-created admin accounts get mobile sign-in. A number on another account is refused with 409.

### Payment System (Custom UPI)
- Payments go to the IDFC FIRST Bank current account `cozyberries@idfcbank` as a registered merchant (switched 2026-10-02 from a personal okaxis VPA). `lib/payments/upi.ts` builds the link from the bank's merchant-QR fields (`ver`, `mode=01`, `orgid`, `mc=5641`, `mid`, `mtid`, `qrMedium=04`) plus `tr` (order number, letters/digits only), `am` (whole rupees, 2 decimals), `cu=INR`, `tn`. That exact shape was scanned and verified in a UPI app; change it only after a fresh ₹1 test.
- `/payment/[orderId]` shows the large QR (720 px PNG, 288 px on screen) with the amount locked, plus a "Save QR" download. Checkout shows no QR (no order, amount or reference yet); `/orders/[id]` links to the payment page while `payment_pending`. There is no pay-to-phone-number option: the number may not map to the IDFC account.
- UPI deep links for PhonePe (`phonepe://pay?`), GPay (`tez://upi/pay?`), Paytm (`paytmmp://pay?`) share the QR's query (`upiAppLinks`)
- Trust-based "I Have Paid" → order status `processing` → admin verifies separately
- Env vars (server-only): `UPI_ID`, `UPI_PAYEE_NAME`, and for merchant mode `UPI_MERCHANT_CODE`, `UPI_MERCHANT_ID`, `UPI_TERMINAL_ID`, `UPI_ORG_ID` (all from decoding the bank's QR). `NEXT_PUBLIC_UPI_ID` is the ID displayed on checkout/orders; keep it equal to `UPI_ID`. `UPI_AID` and `NEXT_PUBLIC_UPI_PHONE` are gone. Values are trimmed, because `vercel env pull` used to leave a trailing newline that landed inside `pa=`; add Vercel values with `--value`, not a pipe.
- Key: `pa` param must NOT have `@` encoded (do not use `encodeURIComponent` on UPI ID)

### Shipping Integration (Delhivery)
- Pincode serviceability check on address creation/selection
- Auto-fills city, state, country from API response
- **Customer tracking:** `GET /api/shipping/order-tracking?orderId=<uuid>` — Supabase session required; loads `orders.tracking_number` for that user and calls Delhivery Pull API (`/api/v1/packages/json/`). Response: `{ tracking: OrderShipmentTrackingData }`. UI: `useOrderShipmentTracking` in `hooks/useApiQueries.ts`, `ShipmentTrackingSection` on `/orders/[id]`.
- Env vars: `DELIVERY_API_KEY` (shared with pincode); `DELHIVERY_BASE_URL` / optional `DELHIVERY_TRACKING_BASE_URL` for carrier host (defaults to `https://track.delhivery.com`)
- **Shipment creation/cancel (admin):** `POST|DELETE /api/admin/orders/[id]/shipment`.
  Cancelling a shipment clears the tracking fields but never changes order status.
- **Webhook pipeline:** Delhivery scan events → `POST /api/webhooks/delhivery`
  (`DELHIVERY_WEBHOOK_TOKEN`) → `webhook_events` queue → QStash schedule
  `delhivery-webhook-processor` (`npm run qstash:schedule-delhivery`) →
  `POST /api/internal/webhooks/delhivery/process` → broadcast notification rows shown
  on `/admin/orders`.
- Additional env vars (server-only): `DELHIVERY_WAREHOUSE_NAME`,
  `DELHIVERY_WEBHOOK_TOKEN`, `INTERNAL_JOB_TOKEN`.

### Stall pickup orders
- `orders.fulfilment_method` is `delivery` (default) or `pickup`. Pickup has no `shipping_address` and `delivery_charge = 0`; both are enforced by CHECK constraints, and `deliveryChargeFor()` (`lib/utils/fulfilment.ts`) is the only place the charge is computed.
- **Only the Telegram ✅ button (or an admin from /admin/orders) makes an order paid.** `orders_on_status_change` (security definer) commits stock and assigns the GST invoice number (`CB/yy-yy/0001`) on any unpaid → paid move, and returns stock on paid → unpaid/cancelled/refunded. `guard_client_order_write` / `guard_client_payment_write` stop the customer's own session from confirming, editing money, recording cash, or adding items to a paid order.
- `/api/telegram/webhook` only accepts ✅ taps from the `TELEGRAM_CHAT_ID` chat and, if `TELEGRAM_CONFIRMER_IDS` (comma-separated Telegram user ids) is set, only from those people.
- `order_items.sku` holds the variant slug resolved server-side (`resolveOrderVariants`). The stock trigger resolves each line with `order_item_variant_slug(sku, product_id, size)`: `sku` first, then `(product, lower(size))`. Lines that match no variant are left out of stock tracking rather than blocking a payment.
- Staff flow: admin creates the customer with name + phone and no OTP (`/api/admin/users/create`, removed 2026-10-04 because customers would not read a code out; the phone is stored with `phone_confirm: false` and nothing checks it, so a mistyped number is not caught), impersonates, checks out with pickup, taps "Received cash" (`/api/payments/cash`), and the owner confirms on Telegram. `/admin/pickup-orders` is the hand-over queue. Its "Awaiting ✅" tab (with a count on every tab) lists pickup orders still `payment_pending` / `verifying_payment`, so an order whose ✅ never came does not drop out of sight; they get no Ready/Collected buttons until confirmed. "Collected today" goes by the order's latest `collected` row in `order_status_events` (`collectedAt()` in `lib/orders/pickup.ts`), so a later edit to an old order does not pull it back into today; `updated_at` is only the fallback, for status edits made before the merge (2026-09-28) that predate `order_status_events` rows — the merged `/api/admin/orders/[id]` PATCH now inserts one (`order_id`, `from_status`, `to_status`, `actor_admin_id`) on every status change.
- GST: `BUSINESS_GSTIN` (server-only, `getBusinessGstin()`, no fallback). Home state 29 (Karnataka) → CGST+SGST; else IGST. Invoice: `GET /api/orders/[id]/invoice`.
- WhatsApp bill: "Send bill" on `/admin/pickup-orders` opens the customer's chat with a signed public link to the bill PDF (`/bill/<orderId>/<sig>`, rendered by `lib/invoice/pdf.tsx` with `@react-pdf/renderer`, same content as the web invoice), followed by a short about-us and contact block. The text is `billMessage()` in `lib/orders/pickup.ts`. The PDF is generated fresh per open, served `Cache-Control: private, no-store` and `noindex`, disallowed in `robots.txt`, and network-only in the service worker. The pickup list API builds `bill_url` server-side.
- Tests: `npm run db:test-pickup` runs the trigger/guard SQL tests inside a rolled-back transaction.
- Live DB fix (2026-09-25): `set_order_number()` / `set_payment_reference()` are SECURITY DEFINER (migration 20260924120000) — customer sessions have no sequence privileges after the deny-by-default migration; `npm run db:test-orders` guards it.

### Stall refills (`/admin/stall-refills`)
- Shelf-refill list for the stall. It shows every paid order's lines (stall and online) for today and yesterday (IST), one line per variant, with a photo, units sold and stock left. It refetches every 30 s while visible (TanStack Query). No Supabase Realtime.
- A sale counts when it is paid: `orders.stock_committed_at` falls on that IST day and the status is paid. Orders awaiting ✅ are not listed. A cancelled paid order drops off, because the trigger clears `stock_committed_at`.
- **Refilled** ticks units off without touching stock. **No stock left** sets `product_variants.stock_quantity = 0`, and the catalog rebuilds in about 10 s. Undo puts the old count back only while the stock is still 0.
- Ticks live in `shelf_refills` (admin/internal tier). It is read and written only through `stall_refill_lines` / `stall_refill_record` / `stall_refill_undo` (service_role only), which `/api/admin/stall-refills` calls after `requireAdmin()` (`lib/services/admin-gate.ts`). `stall_refill_record` takes an advisory lock per day and variant, so two phones cannot tick the same units twice.
- Tests: `npm run db:test-refills` (rolled back), plus vitest for `lib/orders/stall-refills.ts`, both routes, the page guard and the list.
- `/api/admin/*` is network-only in the service worker (`isAdminApiRequest`), so a failed refresh shows the banner instead of a cached list.

### Admin sales dashboard (`/admin`)
- Below the action tiles: Sales, Orders, Avg order and Items per order (vs the previous period), a Stall vs Online share bar, sales and orders over time (stacked), average order value over time, top 8 products (+ "Other") and categories. Spec: `docs/superpowers/specs/2026-10-02-admin-sales-dashboard-design.md`.
- A sale is an order in a paid status (`payment_confirmed`, `processing`, `ready_for_pickup`, `collected`, `shipped`, `delivered`), counted on the IST day of `coalesce(stock_committed_at, created_at)`. Sales = Σ `total_amount` (amount collected, incl. delivery). Product and category value = Σ `price × quantity`, so it does not add up to Sales. Pickup = Stall, delivery = Online.
- Ranges (`lib/admin/sales-range.ts`): 30 days daily, 3 months as 13 Monday-start weeks, 12 months monthly, All time monthly with no comparison. Default 3 months; the chip lives in `?range=`.
- `GET /api/admin/dashboard/sales` adds up raw rows in TS (`lib/admin/sales-metrics.ts`) and caches each range in Redis for 300 s (`admin:dashboard:sales:{range}`). `clearDashboardActions()` deletes those four keys and the action counts in one DEL. Every route that moves an order into or out of a paid status must call it: the admin order, pickup and shipment routes and the Telegram ✅ webhook do. The legacy `app/api/razorpay/verify` route (unused since UPI replaced Razorpay; 503 without `RAZORPAY_KEY_SECRET`) does not; the 300 s TTL covers it.
- Charts are Recharts 3 (`components/admin/charts/`), used only by the dashboard, so storefront bundles do not carry it. Colours were checked with the dataviz palette validator: Stall `#c4703f`, Online `#2f7fc0`, neutral `#8a6b63`.

### Admin stock (`/admin/stock`)
- Tiles (units on hand, value at selling price, sizes out, sizes low), an in/low/out health bar, "Restock next", "Not selling", stock by category and size gaps per product. One block per row. Spec: `docs/superpowers/specs/2026-10-03-admin-stock-dashboard-design.md`.
- Scope is variants of active products. Out = 0 (missing or negative stock counts as 0), low = 1–2 (`LOW_STOCK_MAX`), in stock = 3+. Not selling = stock ≥ 1 and no sale in 60 IST days. Demand is shown as plain counts ("sold 3 in 30 days · last sold 28 Sep"); there are no forecasts and no stock history.
- `GET /api/admin/stock` reads `product_variants` (products, categories and sizes embedded) and every paid order line live on each request: no Redis, nothing to invalidate. `lib/admin/stock-metrics.ts` matches a sale to a size with the same rules as `public.order_item_variant_slug` (sku first, then product + `lower(size)`), over active products only.
- Status colours are the dataviz reference palette (in `#0ca30c`, low `#fab219`, out `#d03b3b`), always with the label and number printed. The phone bottom bar has five items (`grid-cols-5`); a sixth needs the grid widened.

### GST sales register (`/admin/sales-register`)
- Monthly register for the CA's GSTR-1 / GSTR-3B: preview with totals, B2CS, HSN and invoice-number runs, plus a GSTR-1-ready `.xlsx` (sheets Summary, Invoices, B2CS, B2CL, HSN summary, Documents issued, Cancelled earlier). Spec: `docs/superpowers/specs/2026-10-03-gst-sales-register-design.md`.
- GST registration took effect in September 2026 (`GST_REGISTERED_FROM`). Store sales only: the monthly Cellstrat consulting invoice is billed outside the app and goes to the CA separately.
- A month holds the invoices whose `invoice_date` falls in it (IST). Every figure comes from `buildInvoice()`, so it matches the invoice PDFs to the paisa.
- "As at month end": `orders.invoice_voided_at` is stamped by `orders_on_status_change` when an invoiced order leaves a paid status and cleared when it is paid again. An invoice voided in its own month stays listed with zero amounts; one voided in a later month stays valid in its own month and appears in the later month's "Cancelled earlier" as minus figures. A past month's figures stay fixed, except when an order is reinstated (paid again) after that month closed: the trigger clears `invoice_voided_at`, so the closed month changes (a cancelled row turns valid again, or a "Cancelled earlier" line disappears). Tell the CA if that happens.
- `public.backfill_invoice_numbers(p_from)` (service role only) numbers paid orders that have none, in paid-time order, dated with their paid time. The migration ran it from 1 Sep 2026: the two delivered orders paid on 1 Sep 2026 got the next free numbers on the migration date, so they sit after later invoices in the series.
- `lib/gst/` holds it: `register-month` (IST months), `sales-register` (pure builder), `register-summaries` (B2CS/B2CL/HSN/runs), `register-xlsx` (`write-excel-file`), `register-orders` (reads; phone and email never selected). Both routes run `requireAdmin()` first; the download is `private, no-store` and `noindex`.

### Retail consignment (`/admin/retail`)
- Stock placed in GST-registered shops on sale-or-return. Spec: `docs/superpowers/specs/2026-10-08-retail-consignment-design.md`. Cozyberries raises one B2B tax invoice per shop per month for its share (`our_share_pct`, default 75% of the tag MRP, GST included); the shop bills its own customers. Owner to confirm the model with the CA.
- Tables (admin/internal tier, service role only): `retailers`, `consignment_docs` (`challan` `CBC/yy-yy/NNNN`, `sale` `CBR/…`, `return` `RET/…`; draft → issued → cancelled), `consignment_lines` (challan lines are batches with the MRP locked at dispatch; sale/return lines point at a batch), `retailer_payments`, `consignment_counters`. What a shop holds is the view `retailer_batch_balances` (sent − issued sales − issued returns), never stored.
- All writes go through `consignment_save_challan|return|sale`, `consignment_issue`, `consignment_cancel` (per-shop advisory lock). Issuing a challan takes `product_variants.stock_quantity`; issuing a return gives it back; sales never touch stock. Sales and returns draw on the oldest batch first. A shop invoice can be cancelled only before 00:00 IST on the 11th of the month after its invoice date (TOO_LATE → credit note via the CA).
- Approved discounts (agreement revised 2026-10-09; spec `docs/superpowers/specs/2026-10-09-retail-approved-discounts-design.md`): Cozyberries approves up to 4 rates per shop per month (`retailer_discount_rates`, admin tier, via `consignment_add_rate` / `consignment_remove_rate` and `POST|DELETE /api/admin/retail/[id]/rates`). Sale lines carry `discount_pct` (0 = full MRP) and are invoiced at `round(MRP × (100 − rate) × share / 10000)`, so a discount is borne 75 : 25. A rate can't be removed while the month's draft uses it (`RATE_IN_USE`) or once the month is issued; save and issue refuse unapproved rates (`RATE_NOT_APPROVED`). The ₹2,500 check runs on the discounted price. Sheet template v2 has "Sold at full MRP" plus one "Sold at N% off" column per rate; an upload whose rates no longer match is refused ("download it again").
- Open months for GST: the current IST month, plus the previous month until 00:00 IST on the 11th (GSTR-1 due date). A sale is dated at issue: the period's last day (or today if the period is still running) while that period is open, otherwise today, so a late invoice lands in an open month's register, never a filed one. Challans and returns can't be dated before the first open day (`CLOSED_MONTH` → 400; `public.consignment_first_open_day()` = `firstOpenDay()` in `lib/retail/dates.ts`, which also sets the date inputs' `min`).
- Issued challans and sale invoices keep a snapshot of the shop (`consignment_docs.buyer_legal_name|trade_name|gstin|address|state_code`, copied by `consignment_issue`). The PDF and the register read it (`docParty()` in `lib/retail/documents.ts`), so editing a shop never rewrites an issued document or flips CGST+SGST↔IGST in a filed month; drafts preview the shop as it is now.
- A sale is refused at issue when any unit price (share × MRP after any approved discount) is above ₹2,500 (`ABOVE_LOW_RATE` → 409; same ceiling as `GST_LOW_RATE_MAX_UNIT_PRICE`): clothing above ₹2,500 a piece is 18% GST and the invoice charges 5%.
- Monthly flow: download `/api/admin/retail/[id]/sheet?month=` (Sales + About sheets), the shop fills the Sold columns (full MRP and each approved discount), upload it back (row errors → 422, nothing saved), issue, download/share the PDF. Six-month rule (Section 31(7)): batches amber from 5 months, red from 6.
- The sales register adds B2B, HSN B2B and challan runs; `totals.combinedNet` is the GSTR-3B figure. Shop sales stay out of the sales dashboard.
- Tests: `npm run db:test-retail` (rolled back) and vitest under `lib/retail`, `app/api/admin/retail`, `app/admin/retail`, `components/admin/retail`.

### MRP display (display-only, ended 2026-10-07)
- **Ended 7 Oct 2026 00:00 IST** (`NEXT_PUBLIC_MRP_SHOWN_UNTIL`, default `2026-10-07T00:00:00+05:30`): products, carts, checkout and new orders show a plain price with no badge, and every catalogue price went up 10% instead (`node scripts/raise-prices.mjs --percent=10 [--execute]`, nearest rupee, base_price recomputed, backup in `exports/price-changes/`, refuses a second raise without `--again` and any price over ₹2,500). Orders placed between `shownSince` and `shownUntil` keep their MRP rows on `/orders` and on the invoice/bill PDF exactly as issued: `mrpFor(price, at)` / `mrpTotals(items, placedAt)` judge the window at the order's `created_at`. The rest of this section describes how that window behaves.
- Every price was shown as a struck-through MRP plus the catalogue price with a "10% OFF" badge. The MRP is `mrpFor(price) = round(price ÷ (1 − rate))` in `lib/utils/discount.ts`, and `products.price` / `product_variants.price` stay the price charged. There is no MRP column.
- Config lives in `MRP_DISPLAY` (`lib/config/offers.ts`). `NEXT_PUBLIC_MRP_DISCOUNT_RATE` defaults to `0.1`; set it to `0` and redeploy to hide the MRP everywhere. `NEXT_PUBLIC_MRP_SHOWN_SINCE` defaults to `2026-09-27T00:00:00+05:30`. Orders placed before it show no "Discount on MRP" on `/orders`.
- The badge is worked out from the numbers shown, so it stays correct when the Early Bird coupon runs as well (it shows the combined %).
- It appears on product cards, the product page, cart lines, the wishlist, quick-add, `/display`, and the cart, checkout and order summaries (`components/MrpSummaryRows.tsx`).
- Orders whose prices an admin raised show their MRP like any other order (MRP = charged price ÷ 0.9), so nothing tells a customer the prices were raised.
- It appears on the GST invoice (web and PDF) as an MRP column, Total MRP and one combined Discount (MRP saving + any admin or coupon discount; `InvoiceDocument.mrp` from `buildInvoice`). The taxable value, GST and total are unchanged. Owner's decision 2026-10-04; the MRP is computed, so the owner is confirming the presentation with their CA. It never appears in cart/order totals, `/api/orders`, JSON-LD, or the Meta Pixel `value`.

### Admin price override (shadow mode)
- At checkout while impersonating, the amber "Admin tools" box offers Discount ₹, Discount % or Increase % (0.1–100, one decimal) with an optional reason (at most 500 characters). Specs: `docs/superpowers/specs/2026-10-04-admin-percent-price-override-design.md`, `docs/superpowers/specs/2026-10-04-hide-admin-price-raise-design.md`.
- `lib/utils/admin-override.ts` (pure, client-safe) prices it for both the checkout preview and `POST /api/orders` (`priceAdminOverride` / `applyAdminOverride`), so they never disagree. The client sends catalogue prices plus `admin_override: { mode, percent | discount_amount, note }`; the server re-prices only after `validateItemPrices`.
- Discounts are stored as before (`discount_code = ADMIN_OVERRIDE`, rupee `discount_amount`) and stay visible to customers. An increase raises every `order_items.price` to the nearest rupee (worked in tenths of a percent so ties round up) and makes `subtotal` their sum (the paid-status `ITEMS_MISMATCH` check needs that); the order gets no discount code and ₹0 discount, so it looks like any other order.
- An increase is refused when any raised unit price would exceed ₹2,500 (`GST_LOW_RATE_MAX_UNIT_PRICE` in `lib/config/business.ts`): clothing above ₹2,500 a piece is 18% GST and the invoice charges a flat 5%.
- **A customer must never see that prices were raised.** Who applied an override, how much and why live only in `order_price_overrides` (admin/internal tier, service role only; migration 20261004120000, `npm run db:test-overrides`). `POST /api/orders` writes it with the shadow-mode service-role client and rolls the order back if that write fails; `orders.notes` holds only the customer's note. `toCustomerOrder` also strips a leftover `[ADMIN OVERRIDE by …]` line and the retired `ADMIN_PRICE_UP` code (Redis-cached copies). Admins see one line (`formatPriceOverride`) on `/admin/orders` and `/admin/pickup-orders`; Telegram shows "📈 Prices raised +10% (+₹245)" (`lib/services/price-overrides.ts`, also used by the cash route and the ✅ webhook) and a discount line only above ₹0. Customer-facing code must never read that table or import that module.

### Caching Strategy
- **Catalog (products, categories, sizes, ages, genders, colours) is served from Upstash Redis in Mumbai**, never from Supabase on a request. Module: `lib/catalog/` (see `docs/CATALOG_CACHE.md`).
  - Keys live under `cat:` (`cat:product:{slug}` JSON docs, `cat:snapshot`, `cat:reference`, `cat:version`, `cat:meta`). One Redis Search index `cozyberries-search`.
  - Request code reads only through `lib/catalog/cache.ts` (`getSnapshot`, `getProduct`, `getRanking`), which wraps Redis in Next's Data Cache with tags `catalog` and `product:{slug}`. Redis is touched only after an invalidation.
  - Freshness is event-driven: Supabase triggers → `POST /api/catalog/events` (secret header, Redis debounce 8s, burst collapse) → QStash → `POST /api/catalog/rebuild` (signed) → `revalidateTag`. Nightly QStash schedule plus two daily Vercel crons as backstops. A change is live in about 10 seconds.
  - Nothing under `lib/catalog/` may import `next/headers`; that is what keeps `/`, `/products/[id]` and `/api/catalog` static.
  - Free tiers only (Upstash Redis/QStash Free, Vercel Hobby, Supabase Free). Budget: under 3,000 Redis commands and 1,000 QStash messages per day.
- Product order (`lib/catalog/order.ts`, client-safe): every sort puts products without a photo last. The default ("Popular") sort then puts products whose first photo shows a baby model first (`withBaby` in `lib/display/model-photos.json`, looked up by slug; untagged counts as no, so tag new products with `npm run display:untagged`), then best sellers (all-time units on paid orders, stall + online), then newest. The home rows come from `homeProductRows()` (`lib/catalog/home.ts`), worked out on the server: Featured = the top 5 in-stock baby-model products in that order, each badged "Featured"; Loved by Parents = the next 5 in-stock best sellers (`compareBestSeller`, baby rule ignored), never repeating a Featured card. The "Featured" sticker everywhere (home rows, `/products` grid, product page and its related cards) comes from `featuredSlugs()` / `withFeaturedBadge()` over the snapshot, so it always matches the home row; the database `is_featured` flag no longer picks or badges anything on the catalog path (it still drives `?featured=true` and the legacy non-Redis path) (2026-10-10). Price and name sorts and search relevance come after the photo rule. The snapshot is stored in that order, so the home featured row, related products and "Frequently bought together" follow it too.
  - Ranks come from `public.product_sales_ranks` (catalogue tier, ranks only, never unit counts; migration 20261009120000, `npm run db:test-sales-ranking`). Statement-level triggers on `orders` (status) and `order_items` rewrite it via `refresh_product_sales_ranks()` (security definer, not RPC-callable). Every rebuild re-stamps `sales_rank` on all cards; a paid order changes stock, so the order updates with the next rebuild. If the ranks can't be read, the rebuild keeps the previous ranks rather than failing.
- `/products` on mobile defaults to the list view; `?view=grid` opts into the grid; desktop is always a grid (`lib/utils/product-view.ts`). The card container is `[data-testid="product-grid"]` in both views; do not select it by `.grid`.
- Filters sheet options are re-counted against the pending choices (`lib/catalog/facets.ts`); an option that would leave zero products is disabled, never hidden, and the selected option is never disabled. Counting reuses `applyFilters`, so it always agrees with the grid.
- Every Filters-sheet group is multi-select (2026-10-10): `?age=`, `?design=`, `?colour=`, `?gender=` and `?size=` each take a comma list (`?category=` accepts one from links, but the row never writes one) (`filterValues` / `toggleFilterValue` in `lib/catalog/filter.ts`). Choices in one group widen (OR), groups narrow (AND); `buildSearchFilter` mirrors it. Each option is counted as "other groups' choices + this option alone". The category row stays single-select (owner's call, 2026-10-10), is counted under the applied filters (`categoryCounts`), and moves greyed-out categories to the end. Each value gets its own applied-filter chip; removing one drops only that value.
- The Filters sheet has no Size group: size and age are one axis, so it shows Age as the homepage bands via `ageFilterOptions` (single sizes folded into their group, e.g. 3-4Y/4-5Y/5-6Y → 3-6 Years). `?size=` in URLs is still honoured by the filter engine. `useCatalog` never replaces a snapshot with an older `generatedAt` (service worker / persisted cache can hand back a stale copy right after a rebuild).
- `?category=` takes one slug or a comma list. A category that was split up keeps its old links working through `RETIRED_CATEGORIES` in `lib/catalog/filter.ts` (read by `resolveCategorySlugs`, used by both the local filter and the Redis ranking): `frocks` → Frill Sleeve Muslin, Japanese Muslin, Sleeveless Muslin, Muslin Collar (split 2026-09-27, migration 20260927120000, `npm run db:test-split-frocks`).
- Product filters `design` and `colour` (`/products?design=petal-pops&colour=white`): a "design" is a row of the `colors` table (a print such as Petal Pops); a "colour" is that row's `base_color` (the actual clothing colour). `lib/catalog/colours.ts` derives the options and swatches. Every print needs `base_color` filled in or it will not appear under Colour.
- Browser: `hooks/useCatalog.ts` keeps the snapshot in TanStack Query (persisted to localStorage) and `/products` filters locally; the service worker caches `/api/catalog` stale-while-revalidate.
- Per-user data (cart, wishlist, orders, profile) keeps its existing Redis caches in `lib/services/cache.ts`.
- `CATALOG_SOURCE` (`legacy` default) gates the compatibility API routes and the product/home pages; `/products` and `/api/catalog` always read the catalog. Removed in the cleanup task.

### Stall display (`/display`)
- Endless product-photo loop for the offline stall (spec: `docs/superpowers/specs/2026-09-25-stall-display-loop-design.md`). It reads the catalog snapshot exactly like `/products`; it makes no Redis or Supabase calls of its own.
- Only in-stock products listed under `withBaby` in `lib/display/model-photos.json` appear (their first photo shows a baby). New products stay hidden until tagged: run `npm run display:untagged`, look at the first photos it lists, add each slug to `withBaby` or `withoutBaby`, then deploy.
- Pyjama slugs say the rib (2026-10-10): `pyjamas-with-rib-*` are the 0-3M/3-6M ones, `pyjamas-without-rib-*` 6-12M and up. Thirteen products were renamed that day (`lib/catalog/renamed-products.json`); old URLs 308 to the new slug, and old carts, wishlists and `?design=naugthy-nuts` links are re-keyed. Variant slugs kept their old prefixes on purpose (paid orders' `sku`).
- Photos are the `1_detail.webp` variants, cached by the page itself in Cache Storage `display-photos` (refreshed after 7 days). Do not replace this with a service-worker `CacheFirst` rule on `*_detail.webp`: that would pin product-detail images for every customer. The `/display` HTML is kept 30 days in the SW cache `display-page-${v}`.
- Staff setup: open `https://cozyberries.in/display` on Wi-Fi → "Add to Home screen" / "Install app" → open **CozyBerries Display** → tap "Tap to start" once → set the device's screen timeout to "never" and exempt the browser from battery saver → leave it on Wi-Fi for a minute so all photos download (about 5 MB). After that it plays offline, resumes by itself after deploys, and reloads nightly at 4 am when online.

### Path Aliases
- `@/*` maps to project root (configured in `tsconfig.json`)

### Key Conventions
- API routes use server-only secrets (never expose UPI/shipping keys to client)
- `POST|GET /api/notifications` and `PATCH /api/notifications/[id]` verify the session, then use **`SUPABASE_SERVICE_ROLE_KEY`** to read/write rows scoped by `user_id` (avoids `GRANT`/`RLS` drift across Supabase projects)
- `AddressFormModal` accepts `enablePincodeCheck` prop to toggle Delhivery validation
- A cart line is keyed on product + size (`getCartItemKey`); colour is stored on the line but is not part of the key. The pages disagree on colour (the product page saves `product.colors[0]`, cards and "Frequently bought together" save none, the wishlist saves `""`, a reorder saves the order's colour name), and a colour in the key used to split one size into two lines. `collapseCartLines` folds such duplicates in carts saved before the change, on load and in `cartService.mergeCartItems`.
- Pre-filled WhatsApp messages go through `whatsappLink()` (`lib/utils/whatsapp.ts`), which builds `api.whatsapp.com/send?phone=…&text=…`. Do not build `wa.me/…?text=` for text with emojis: its redirect turns every emoji into `�` (other non-ASCII such as `₹` survives).
- Cart edits outside `/cart` (the product card's ✓ picker, the product page's quantity control) go through `lib/utils/cart-edit.ts` via `useProductCartEdit`.
- `lib/types/` for shared TypeScript types, `lib/utils/` for helpers, `lib/services/` for API clients
- Static pages must ship their content in the HTML: no `useSearchParams()` in components rendered by `/` or `/products/[id]` (read `window.location` in an effect instead), and no `ssr: false` for content sections. `tests/catalog.spec.ts` "Static HTML carries real content" enforces it.
- Env vars for the catalog pipeline: CATALOG_BASE_URL, CATALOG_WEBHOOK_SECRET, QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY, QSTASH_URL (server-only). The QStash account is regional (`https://qstash-us-east-1.upstash.io`); without QSTASH_URL the SDK hits the default endpoint and fails with "user not found in this region". QStash deduplication ids must not contain ':'. Vercel functions are pinned to bom1 in vercel.json.
- `ConditionalLayout` renders no storefront header or bottom nav under `/admin`; the shell supplies its own. `/admin/print/*` gets neither (bare children from `AdminShell`).
- Functions run on Fluid compute (`"fluid": true` in vercel.json, guarded by `vercel-config.test.ts`). The project predates Fluid being the default, so without that line it falls back to legacy serverless: after a few idle minutes the first request to a function group often pays a 400-900 ms cold start (each group separately), which is what made `/products` (rendered per request) take 1-1.5 s and fail the 600 ms check in `catalog:verify`. Fluid shares one process between concurrent requests, so module-level state must never hold per-request or per-user data.

### Database Security Conventions

The `public` schema is deny-by-default. `ALTER DEFAULT PRIVILEGES` grants
`anon` and `authenticated` nothing; every privilege is granted explicitly.
Run `npm run db:lint` (Supabase's splinter linter) and `npm run db:probe`
(reachability assertions) before merging any migration. CI runs `db:lint`
on pushes to `main`, `develop` and `feature/**` — and on the occasional PR —
that touch `supabase/migrations/**` or `scripts/sql/**`; see
`.github/workflows/db-lint.yml`. The job only enforces once
`POSTGRES_URL_NON_POOLING` is added as a repository secret — until then it
emits a `::warning::` annotation saying the guard is inactive and exits 0, so
it never blocks pushes on a secret nobody has added yet.
The `push` trigger is the one that matters: this project merges directly to
`develop` and `main` without PRs, so a PR-only trigger would never fire.
Supabase Postgres on the free tier has no IP allow-listing, so the
GitHub-hosted runner can reach the database directly — once the secret is
set, this is a real gate, not an informational job. As of the stall-pickup
migration (2026-09-25) the linter reports `ERROR=0, WARN=1, INFO=21`; the one remaining warning is a
`duplicate_index` on `sizes` (`sizes_slug_key`) that is permanent by design
because `product_variants_size_slug_fkey` is backed by it — do not chase it.
A scoped read-only role is sufficient for `POSTGRES_URL_NON_POOLING` in CI:
`CONNECT` on the database, `USAGE` on `public` and `storage`, and `SELECT` on
`storage.buckets` lets the linter read every catalog it needs (`pg_class`,
`pg_policies`, `pg_proc`, `pg_default_acl`, `pg_stat_user_indexes`,
`pg_extension`) while reading zero application tables — much safer to hand
to CI than the full `postgres` connection string, since anyone who can edit
a workflow file can read whatever secret is wired into it. The one gap: RLS
hides all rows from that role in `storage.buckets`, so the public-bucket
check will false-negative under it.

Every new table must be assigned a tier in its migration:

- **Catalogue** — public data. `GRANT SELECT` to `anon, authenticated`, plus a
  `FOR SELECT TO anon, authenticated USING (true)` policy. Writes via
  `service_role` only.
- **User-owned** — `GRANT` to `authenticated` only, never `anon`. RLS enabled
  and `FORCE`d, policy `TO authenticated USING (user_id = (select auth.uid()))`.
- **Admin/internal** — no grants, no policies. `service_role` only. Choose this
  for anything holding PII.

Policy rules, each of which was a root cause of a linter finding class:

- Always name the roles with `TO`. Omitting it targets the `public` role, which
  includes `anon`, `authenticator` and `dashboard_user`.
- Always write `(select auth.uid())`, never bare `auth.uid()`, so Postgres
  hoists it into an InitPlan instead of re-evaluating it per row.
- Every function declares `SET search_path`. `SECURITY DEFINER` functions must
  use `SET search_path = ''` and fully qualify every reference.
- `SECURITY DEFINER` functions get `REVOKE ALL ... FROM anon, authenticated`
  unless they are deliberately part of the public RPC surface.

**Known residual gap — default privileges owned by `supabase_admin`.**
Default privileges in Postgres are per-grantor. The `postgres` grantor was
fixed: it now grants `anon` nothing. But the `supabase_admin` grantor still
carries Supabase's stock defaults — `arwdDxt` on tables and `rwU` on
sequences to `anon` and `authenticated`, `X` on functions. That cannot be
changed from our connection: `ALTER DEFAULT PRIVILEGES FOR ROLE
supabase_admin ...` fails with `must be member of role "supabase_admin"`, and
the free tier gives us no way to become that role. Do not attempt the `ALTER`;
it will only fail again.

What this means in practice: a table created *by* `supabase_admin` would land
wide open to `anon`. The creation paths we actually use are safe — migrations
run as `postgres`, and the Dashboard SQL editor also runs as `postgres`, so
both inherit the corrected defaults. The exposure is limited to objects
created by Supabase's own internal tooling under `supabase_admin`. `npm run
db:lint` is the control that catches it: a table that slips through with
`anon` privileges surfaces as an ERROR-level finding, and the `db-lint`
workflow fails the build.

### Admin impersonation E2E
- Run: `npm run test:admin-impersonation` (Desktop Chrome, reuses `purchase-auth-setup`).
- Env vars: `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` (same as other e2e specs); the user must have `user_metadata.role = 'admin'` in Supabase.
- Flow: create new user → impersonate → checkout with admin override → "I Have Paid" → Exit → verify row on `/admin/on-behalf-orders`. **Stale:** `tests/admin-impersonation.spec.ts` still opens an "Impersonate user" dialog from `/profile`, which moved to the `/admin/impersonate` page. Creation itself needs no OTP again (since 2026-10-04) and the button reads "Create & continue", as the spec expects.
- By design the test leaves the newly-created Supabase auth user behind (timestamped email, no auto-cleanup — parallel runs must not race on deletion). Clean up manually in Supabase Dashboard → Auth → Users if the list gets noisy.

### Playwright MCP (Cursor)
- Project-level MCP is in `.cursor/mcp.json` and runs `@playwright/mcp` with this repo’s `playwright.config.ts`.
- If the Playwright MCP shows "errored" in Cursor: **fully quit and restart Cursor** (MCP servers load at startup). Ensure Node 20+ and run `npx playwright install chromium` in the project. If you use the Cursor Playwright plugin, you can disable it and rely on the project MCP to avoid duplicate/conflict.

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |
