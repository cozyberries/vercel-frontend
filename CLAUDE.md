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
npm run catalog:rebuild            # POST a full rebuild event (or -- --slug=<slug>)
npm run qstash:setup               # (once) create the nightly full-rebuild schedule
npm run catalog:verify -- --url=https://cozyberries.in   # post-deploy checks

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
  /api/catalog               # Static snapshot for browsers (revalidated on change)
  /api/catalog/events        # Supabase change webhook (x-catalog-secret)
  /api/catalog/rebuild       # QStash-signed / cron rebuild job
  /api/search                # Redis Search ranking
  /api/health/catalog        # Catalog health (version, age, counts)
  /api/auth/generate-token   # JWT generation (bypasses RLS)
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
- **Catalog (products, categories, sizes, ages, genders, colours) is served from Upstash Redis in Mumbai**, never from Supabase on a request. Module: `lib/catalog/` (see `docs/CATALOG_CACHE.md`).
  - Keys live under `cat:` (`cat:product:{slug}` JSON docs, `cat:snapshot`, `cat:reference`, `cat:version`, `cat:meta`). One Redis Search index `cat_products`.
  - Request code reads only through `lib/catalog/cache.ts` (`getSnapshot`, `getProduct`, `getRanking`), which wraps Redis in Next's Data Cache with tags `catalog` and `product:{slug}`. Redis is touched only after an invalidation.
  - Freshness is event-driven: Supabase triggers → `POST /api/catalog/events` (secret header, Redis debounce 8s, burst collapse) → QStash → `POST /api/catalog/rebuild` (signed) → `revalidateTag`. Nightly QStash schedule plus two daily Vercel crons as backstops. A change is live in about 10 seconds.
  - Nothing under `lib/catalog/` may import `next/headers`; that is what keeps `/`, `/products/[id]` and `/api/catalog` static.
  - Free tiers only (Upstash Redis/QStash Free, Vercel Hobby, Supabase Free). Budget: under 3,000 Redis commands and 1,000 QStash messages per day.
- Browser: `hooks/useCatalog.ts` keeps the snapshot in TanStack Query (persisted to localStorage) and `/products` filters locally; the service worker caches `/api/catalog` stale-while-revalidate.
- Per-user data (cart, wishlist, orders, profile) keeps its existing Redis caches in `lib/services/cache.ts`.

### Path Aliases
- `@/*` maps to project root (configured in `tsconfig.json`)

### Key Conventions
- API routes use server-only secrets (never expose UPI/shipping keys to client)
- `POST|GET /api/notifications` and `PATCH /api/notifications/[id]` verify the session, then use **`SUPABASE_SERVICE_ROLE_KEY`** to read/write rows scoped by `user_id` (avoids `GRANT`/`RLS` drift across Supabase projects)
- `AddressFormModal` accepts `enablePincodeCheck` prop to toggle Delhivery validation
- `lib/types/` for shared TypeScript types, `lib/utils/` for helpers, `lib/services/` for API clients
- Env vars for the catalog pipeline: CATALOG_BASE_URL, CATALOG_WEBHOOK_SECRET, QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY (server-only). Vercel functions are pinned to bom1 in vercel.json.

### Admin impersonation E2E
- Run: `npm run test:admin-impersonation` (Desktop Chrome, reuses `purchase-auth-setup`).
- Env vars: `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` (same as other e2e specs); the user must have `user_metadata.role = 'admin'` in Supabase.
- Flow: create new user → impersonate → checkout with admin override → "I Have Paid" → Exit → verify row on `/admin/on-behalf-orders`.
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
