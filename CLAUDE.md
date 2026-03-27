# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
4. **Supabase** — real-time auth via `onAuthStateChange()`

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
- Phone number required before checkout (enforced by middleware)
- Roles: `customer`, `admin`, `super_admin`
- Profile auto-created on signup via API route (bypasses RLS)
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
- `AddressFormModal` accepts `enablePincodeCheck` prop to toggle Delhivery validation
- `lib/types/` for shared TypeScript types, `lib/utils/` for helpers, `lib/services/` for API clients

### Playwright MCP (Cursor)
- Project-level MCP is in `.cursor/mcp.json` and runs `@playwright/mcp` with this repo’s `playwright.config.ts`.
- If the Playwright MCP shows "errored" in Cursor: **fully quit and restart Cursor** (MCP servers load at startup). Ensure Node 20+ and run `npx playwright install chromium` in the project. If you use the Cursor Playwright plugin, you can disable it and rely on the project MCP to avoid duplicate/conflict.
