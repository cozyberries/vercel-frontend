# Storefront Functionality Audit — 2026-07-21

Full read-only audit of every user-facing (non-admin) action on the storefront, tracing
each one to its actual backend/DB wiring, done after the `design-system-port` redesign
landed. Scope: this repo only (customer storefront). Admin portal (`../cozyberries-admin/`)
was out of scope.

**Status: revisit after the admin-side work is finished.** Nothing below was fixed yet —
this is the findings report only, per explicit instruction to hold off on changes until
the admin work is done, then re-audit and fix anything still outstanding.

## 🔴 Critical — breaks the core purchase flow

- **`app/payment/[orderId]/page.tsx` has no "I Have Paid" action wired to the backend.**
  The page only renders the UPI deep-link button and a "send screenshot on WhatsApp"
  button. Nothing in the codebase calls `POST /api/payments/confirm` from the client
  (repo-wide grep confirmed zero non-test call sites). `/api/payments/confirm` itself is
  fully implemented and correct — verifies order ownership, inserts into `payments`,
  transitions `orders.status` `payment_pending → verifying_payment`, sends notifications —
  it's just never invoked. As shipped, a customer-placed order can never leave
  `payment_pending` through any UI action; only manual/admin intervention moves it forward.
  This is the single biggest gap found in the whole audit.
  - Fix is frontend-only (wire an existing button to the existing, working endpoint), no
    migration needed.

## 🟠 Real, fixable bugs (migration hygiene)

- **Stray nested migration file**: `supabase/migrations/supabase/migrations/20250310000000_add_area_to_user_addresses.sql`
  sits one directory too deep. The Supabase CLI only scans `supabase/migrations/*.sql`
  non-recursively, so this file is never picked up by `supabase db push`/migration
  history tooling. The `user_addresses.area` column it adds is live and working in
  production today (confirmed via code paths in `AddressFormModal.tsx` and
  `app/api/profile/addresses/route.ts`, and via a direct read-only query against the live
  DB), which means it was applied out-of-band (dashboard/manual), not through tracked
  migrations.
  - Fix: `git mv` the file to `supabase/migrations/20250310000000_add_area_to_user_addresses.sql`
    and confirm it's registered in the Supabase migration history table so future
    `db push`/diff tooling doesn't try to re-apply or conflict with it.

- **Migration history is incomplete for full schema reproducibility.** Several core
  tables have no `CREATE TABLE` anywhere in the 15 tracked migration files — only
  `ALTER TABLE` statements assuming they already exist:
  - `orders`, `order_items` (order flow)
  - `user_carts` (confirmed live via direct query, 27 rows)
  - `user_wishlists` (confirmed live via direct query, 27 rows — the wishlist route is
    real, not broken; it's the DDL history that's missing)
  - `ratings`, `sizes`, `products`, base `user_addresses` table
  These tables clearly exist and work in production, so nothing is broken today — but a
  fresh database could not be rebuilt from this repo's `supabase/migrations/` alone. Worth
  a baseline schema dump migration at some point so migration history is authoritative.

## 🟡 Dead code / misleading UI (not broken, just not real — cleanup candidates)

- **Razorpay integration is fully unused.** `app/api/razorpay/order/route.ts`,
  `app/api/razorpay/verify/route.ts`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`
  env vars, and the `razorpay` npm dependency are all dead — no client code calls either
  route, no checkout button loads `checkout.js`. Checkout exclusively uses the UPI flow.
  Candidate for full removal.
- **`lib/services/orders.ts`'s `createPayment`/`updatePayment`/`getOrderPayments`** are
  unused leftovers from a pre-redesign client-driven payment flow — only imported by
  read-only order-history/invoice pages, which never call them.
- **`components/SortSheet.tsx`'s "Top Rated" sort option does nothing.** Code comment
  admits there's no rating field to sort by; clicking it only sets local UI state, never
  triggers a re-sort or updates the URL/query params. Misleading — either implement it for
  real (needs a rating aggregate on `Product`) or remove the option.
- **Offers/discount system is 100% env-var driven, not DB-backed.** `app/offers/page.tsx`,
  `app/api/offers/active/route.ts`, `lib/config/offers.ts` all key off a single hardcoded
  `EARLY_BIRD_OFFER` constant gated by `NEXT_PUBLIC_EARLY_BIRD_*` env vars — there is no
  `offers`/`discounts` table. Not a bug, but worth knowing since it's the one "backend
  feature" on the storefront that isn't actually connected to the database.
- **`components/ShareButton.tsx`** doesn't use the Web Share API (`navigator.share`) at
  all — falls back straight to clipboard copy, and for very old browsers, a deprecated
  `document.execCommand("copy")` whose return value isn't checked (fails silently, no
  crash). Low priority.

## ⚪ Cosmetic only (no functional impact)

- Playwright specs (`tests/auth.spec.ts`, `tests/signup-verification.spec.ts`,
  `tests/signup-debug.spec.ts`) still navigate to deleted `/register`, `/register/email`
  routes — will fail CI when run, but nothing user-facing.
- Stale code comment in `lib/auth-phone.ts` claims it creates "profiles and
  user_profiles" rows; no such tables exist — all writes actually go to `auth.users`
  per the documented convention. Comment is just wrong, not the code.
- Stale "ProfileForm" mentions in `playwright.config.ts` and
  `tests/admin-impersonation.spec.ts` comments — that component was deleted in the
  redesign, no functional impact.

## ✅ Confirmed working end-to-end (no issues found)

- Auth: signup, login (email + phone/OTP via VerifyNow), complete-profile, sign-out —
  all real, hit `auth.users` directly via the documented admin-API convention, no custom
  profiles table.
- Cart: `cart-context` → `/api/cart` → `user_carts`, fully wired.
- Checkout address flow: address CRUD, pincode serviceability check, admin-impersonation
  override — all real and correctly scoped.
- Notifications: `getUser()`-then-scope-by-`user_id` pattern correctly followed in both
  `/api/notifications` routes before any service-role query — no security gap found.
- Notification preferences: persisted for real via `user_metadata` on `auth.users`
  (correct pattern for a schemaless field, no migration needed).
- Orders list/detail/invoice, reorder (validates live stock/price), shipment tracking
  (correctly gated on `tracking_number`, real Delhivery call) — all real.
- Note: no route in this repo ever transitions an order to `shipped`/`delivered`/
  `cancelled`/`refunded` — expected, since CLAUDE.md documents that shipment creation and
  status changes happen in the separate admin app, not here.
- Ratings/reviews write path (`/api/ratings` → real `ratings` table + image upload) is
  code-complete; table currently has 0 rows, plausibly just no submissions yet rather than
  a broken path.
- Products/search/filter/quick-add: live Redis+Upstash Search with Supabase ILIKE
  fallback, quick-add wired to real cart persistence, `sizes` table genuinely queried.
- Deleted components (`CartSheet`, `SearchResultsSheet`, `WishlistSheet`,
  `ProfileForm`, `announcement-bar`) and deleted `/size-guide` route have zero dangling
  references anywhere in `app/` or `components/`.
