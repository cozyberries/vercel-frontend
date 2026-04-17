# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## This Repo's Role

This is the **public-facing storefront** for CozyBerries (cozyberries.com, port 3000).
Customers browse products, manage their cart, checkout, pay via UPI, and track orders here.

The **admin portal** lives in a sibling repo: `../cozyberries-admin/` (admin.cozyberries.com, port 4000).
That app handles product/order/user management, expense tracking, shipment creation, analytics, and webhook processing.
Do not add admin-only operations here. Do not use `JWT_SECRET` in this repo.
`SUPABASE_SERVICE_ROLE_KEY` is allowed **only** in server-side API routes that (1) verify the user session with `getUser()` first and (2) scope every query by `user_id` — the notifications API (`/api/notifications`) follows this pattern to avoid RLS/GRANT drift. Do not use it for any other purpose in this repo.
`IMPERSONATION_SIGNING_SECRET` signs/verifies the `acting_as` cookie used by admin-order-on-behalf. Server-only, 32+ random bytes, distinct from `JWT_SECRET`.

## Commands

```bash
# Development
npm run dev          # Start dev server on port 3000

# Build & Production
npm run build        # Build for production
npm run start        # Start production server

# Code Quality
npm run lint         # Run ESLint (Next.js config)

# Testing (E2E with Playwright — skip for now per project conventions)
npx playwright test                      # All browsers
npx playwright test --project=chromium  # Single browser
npx playwright test tests/foo.spec.ts   # Single test file
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
  /api/products/*            # Product data APIs
  /api/payments/*            # UPI link generation + confirmation
  /api/shipping/pincode-check   # Delhivery serviceability check
  /api/shipping/order-tracking  # Delhivery package tracking (auth + orderId; proxies carrier)
  /api/auth/generate-token   # JWT generation (bypasses RLS)
```

### Auth Flow
- Supabase SSR auth with middleware at `middleware.ts`
- Protected routes: `/profile`, `/checkout`, `/complete-profile`
- Phone number required before checkout (enforced by middleware — reads `user.phone` from `getUser()`, no extra DB query)
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

### Payment System (Custom UPI)
- UPI deep links for PhonePe (`phonepe://pay?`), GPay (`tez://upi/pay?`), Paytm (`paytmmp://pay?`)
- QR code generated server-side to keep UPI credentials out of client
- Trust-based "I Have Paid" → order status `processing` → admin verifies separately
- Env vars required: `UPI_ID`, `UPI_PAYEE_NAME`, `UPI_AID`
- Key: `pa` param must NOT have `@` encoded (do not use `encodeURIComponent` on UPI ID)

### Shipping Integration (Delhivery — Phase 1)
- Pincode serviceability check on address creation/selection
- Auto-fills city, state, country from API response
- **Customer tracking:** `GET /api/shipping/order-tracking?orderId=<uuid>` — Supabase session required; loads `orders.tracking_number` for that user and calls Delhivery Pull API (`/api/v1/packages/json/`). Response: `{ tracking: OrderShipmentTrackingData }`. UI: `useOrderShipmentTracking` in `hooks/useApiQueries.ts`, `ShipmentTrackingSection` on `/orders/[id]`.
- Env vars: `DELIVERY_API_KEY` (shared with pincode); `DELHIVERY_BASE_URL` / optional `DELHIVERY_TRACKING_BASE_URL` for carrier host (defaults to `https://track.delhivery.com`)
- Shipment creation remains in the admin app; storefront only displays tracking when `tracking_number` is set

### Caching Strategy
- Next.js cache headers set in `next.config.mjs`: 1h for reference data, 60s for products
- Cloudinary handles image CDN caching

### Path Aliases
- `@/*` maps to project root (configured in `tsconfig.json`)

### Key Conventions
- API routes use server-only secrets (never expose UPI/shipping keys to client)
- `POST|GET /api/notifications` and `PATCH /api/notifications/[id]` verify the session, then use **`SUPABASE_SERVICE_ROLE_KEY`** to read/write rows scoped by `user_id` (avoids `GRANT`/`RLS` drift across Supabase projects)
- `AddressFormModal` accepts `enablePincodeCheck` prop to toggle Delhivery validation
- `lib/types/` for shared TypeScript types, `lib/utils/` for helpers, `lib/services/` for API clients

### Admin impersonation E2E
- Run: `npm run test:admin-impersonation` (Desktop Chrome, reuses `purchase-auth-setup`).
- Env vars: `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` (same as other e2e specs); the user must have `user_metadata.role = 'admin'` in Supabase.
- Flow: create new user → impersonate → checkout with admin override → "I Have Paid" → Exit → verify row on `/admin/on-behalf-orders`.
- By design the test leaves the newly-created Supabase auth user behind (timestamped email, no auto-cleanup — parallel runs must not race on deletion). Clean up manually in Supabase Dashboard → Auth → Users if the list gets noisy.

### Playwright MCP (Cursor)
- Project-level MCP is in `.cursor/mcp.json` and runs `@playwright/mcp` with this repo’s `playwright.config.ts`.
- If the Playwright MCP shows "errored" in Cursor: **fully quit and restart Cursor** (MCP servers load at startup). Ensure Node 20+ and run `npx playwright install chromium` in the project. If you use the Cursor Playwright plugin, you can disable it and rely on the project MCP to avoid duplicate/conflict.
