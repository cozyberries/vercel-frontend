# Delhivery order tracking — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated customers see live Delhivery shipment status and scan history on the order detail page, with a list-page link to that view; all Delhivery calls are server-side and scoped to the order owner.

**Architecture:** A new authenticated Next.js route under `app/api/shipping/` loads the order from Supabase, verifies `user_id`, reads `tracking_number` (waybill), calls Delhivery’s tracking endpoint with `DELIVERY_API_KEY`, and returns a **normalized** JSON. The order detail page uses TanStack Query (`staleTime` ~3 minutes) via a small client hook; the orders list only links to `/orders/[id]#shipment-tracking`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (server client + cookies), TanStack Query v5, existing `orderService` auth header pattern.

**Spec:** `docs/superpowers/specs/2026-03-26-order-tracking-delhivery-design.md`

> **Note on testing:** This repo often skips automated E2E for small features (per project conventions). Verify with `npm run dev`, a real or staging AWB, and the manual cases in Task 5.

---

## File map

| File | Role |
|------|------|
| `lib/types/delhivery-tracking.ts` | Normalized DTO (`ShipmentTrackingResponse`, scan line items) for UI + API JSON contract |
| `lib/server/delhivery-package-tracking.ts` | Server-only: `fetchPackageTrackingByWaybill(waybill)` — HTTP to Delhivery, parse, map to normalized shape (`import "server-only"`) |
| `app/api/shipping/order-tracking/route.ts` | `GET`: auth → DB row → waybill → Delhivery helper → JSON |
| `lib/services/orders.ts` | `getOrderShipmentTracking(orderId)` — `fetch` to new API with Bearer (same as `getOrder`) |
| `hooks/useApiQueries.ts` (or `hooks/useOrderShipmentTracking.ts`) | `useOrderShipmentTracking(orderId, enabled)` — `useQuery`, `queryKey: ["order-shipment-tracking", orderId]`, `staleTime: 3 * 60 * 1000` |
| `components/orders/ShipmentTrackingSection.tsx` | Client UI: loading, error, timeline from normalized scans |
| `app/orders/[id]/page.tsx` | Render section when `tracking_number` present; `id="shipment-tracking"` for anchor |
| `app/orders/page.tsx` | Link “Track shipment” → `/orders/[id]#shipment-tracking` when `tracking_number` set |
| `CLAUDE.md` | Document `GET /api/shipping/order-tracking`, optional `DELHIVERY_TRACKING_BASE_URL` |

**Env (align with existing pincode code):** Pincode uses `DELIVERY_API_KEY` and `DELHIVERY_BASE_URL` in `lib/utils/shipping-helpers.ts`. Reuse **`DELIVERY_API_KEY`** for tracking. Add optional **`DELHIVERY_TRACKING_BASE_URL`** (fallback: `process.env.DELHIVERY_BASE_URL || "https://track.delhivery.com"` — same as pincode default).

**Delhivery contract:** Before coding the HTTP call, open [Delhivery B2C — Order tracking](https://one.delhivery.com/developer-portal/document/b2c/detail/order-tracking) and copy the **exact** production URL, method, query/body, and auth header style. Many integrations use the **packages JSON** pattern on the track host (e.g. waybill + token query params); your portal page is authoritative — adjust `delhivery-package-tracking.ts` to match. If the response shape differs from your first guess, update the mapper only in that file.

---

## Task 1: Types and Delhivery server helper

**Files:**

- Create: `lib/types/delhivery-tracking.ts`
- Create: `lib/server/delhivery-package-tracking.ts`

- [ ] **Step 1.1: Add normalized types**

Define types the UI needs, for example:

```ts
// lib/types/delhivery-tracking.ts
/** One scan / status event for the timeline (newest-first sort in UI). */
export interface ShipmentTrackingScan {
  status: string;
  location?: string;
  /** ISO string if parsed, else raw date string from carrier */
  timestamp?: string;
  remarks?: string;
}

/** Payload returned by our API and consumed by React Query + UI. */
export interface OrderShipmentTrackingData {
  waybill: string;
  /** High-level current status label if available */
  currentStatus?: string;
  scans: ShipmentTrackingScan[];
}
```

Extend with fields you discover in the real JSON (e.g. `expectedDelivery`, `pod`) only if the portal documents them and the UI shows them.

- [ ] **Step 1.2: Implement server-only fetch + mapper**

In `lib/server/delhivery-package-tracking.ts`:

- `import "server-only";`
- Read `DELIVERY_API_KEY`; if missing, throw a clear error (same messaging style as `checkPincodeServiceability`).
- Build URL from `DELHIVERY_TRACKING_BASE_URL || process.env.DELHIVERY_BASE_URL || "https://track.delhivery.com"` + path/query per **portal doc**.
- `fetch` with reasonable `signal`/timeout (e.g. `AbortController` 15s).
- Parse JSON; map to `OrderShipmentTrackingData`. Defensive: if Delhivery returns `{ success: false }` or empty package list, throw or return a structured error the route can turn into 502 + message.
- **Do not** log the API key.

- [ ] **Step 1.3: Commit**

```bash
git add lib/types/delhivery-tracking.ts lib/server/delhivery-package-tracking.ts
git commit -m "feat(shipping): Delhivery package tracking types and server fetch helper"
```

---

## Task 2: API route `GET /api/shipping/order-tracking`

**Files:**

- Create: `app/api/shipping/order-tracking/route.ts`
- Reference: `app/api/orders/route.ts` (Supabase `createServerSupabaseClient` + `getUser` pattern)

- [ ] **Step 2.1: Implement handler**

1. `const cookieStore = await cookies();` + `createServerSupabaseClient(cookieStore)`.
2. `getUser()` — if no user → `401` JSON `{ error: "Authentication required" }`.
3. `orderId` from `searchParams`; validate UUID-ish / non-empty → else `400`.
4. `supabase.from("orders").select("id, user_id, tracking_number").eq("id", orderId).eq("user_id", user.id).maybeSingle()`.
5. If no row → `404` `{ error: "Order not found" }` (same message as missing to avoid leaking).
6. If no `tracking_number` (null/empty) → `400` `{ error: "Tracking is not available for this order yet" }`.
7. Call `fetchPackageTrackingByWaybill(tracking_number)`.
8. Return `NextResponse.json({ tracking: data })` with **no** `Cache-Control: public** (private or short `max-age=0` — user-specific).

On Delhivery/network failure: `502` or `503` with generic `{ error: "Unable to load tracking. Please try again later." }`; `console.error` with order id and status, not the key.

**Performance:** Auth then DB then Delhivery is inherently sequential; do not add unnecessary awaits before branching.

- [ ] **Step 2.2: Manual curl check (optional)**

With a valid session cookie and real `orderId` that has a waybill:

```bash
# Replace COOKIE and ORDER_ID — run against local dev
curl -s -H "Cookie: COOKIE" "http://localhost:3000/api/shipping/order-tracking?orderId=ORDER_ID" | jq .
```

Expected: `200` + `{ tracking: { waybill, scans, ... } }` or documented error JSON.

- [ ] **Step 2.3: Commit**

```bash
git add app/api/shipping/order-tracking/route.ts
git commit -m "feat(api): authenticated order shipment tracking proxy"
```

---

## Task 3: Client — `orderService` + `useOrderShipmentTracking`

**Files:**

- Modify: `lib/services/orders.ts`
- Modify: `hooks/useApiQueries.ts` **or** create `hooks/useOrderShipmentTracking.ts` and export from a barrel if the project prefers

- [ ] **Step 3.1: Add `getOrderShipmentTracking` to `OrderService`**

Mirror `getOrder`:

```ts
async getOrderShipmentTracking(orderId: string): Promise<OrderShipmentTrackingData> {
  const headers = await this.getHeaders();
  const params = new URLSearchParams({ orderId });
  const res = await fetch(`/api/shipping/order-tracking?${params}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to load tracking");
  }
  const data = await res.json();
  return data.tracking as OrderShipmentTrackingData;
}
```

Import `OrderShipmentTrackingData` from `@/lib/types/delhivery-tracking`.

Export a singleton method or ensure `orderService` is the same instance used elsewhere.

- [ ] **Step 3.2: Add React Query hook**

```ts
// Example — adjust import path if hook lives in useApiQueries.ts
export function useOrderShipmentTracking(orderId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["order-shipment-tracking", orderId],
    queryFn: () => orderService.getOrderShipmentTracking(orderId!),
    enabled: Boolean(orderId && enabled),
    staleTime: 1000 * 60 * 3,
    gcTime: 1000 * 60 * 15,
  });
}
```

- [ ] **Step 3.3: Commit**

```bash
git add lib/services/orders.ts hooks/useApiQueries.ts  # or new hook file
git commit -m "feat(orders): client fetch + query hook for shipment tracking"
```

---

## Task 4: UI — detail section + list link

**Files:**

- Create: `components/orders/ShipmentTrackingSection.tsx`
- Modify: `app/orders/[id]/page.tsx`
- Modify: `app/orders/page.tsx`

- [ ] **Step 4.1: `ShipmentTrackingSection`**

`"use client"`. Props: `orderId: string`, `waybill: string` (display only; query uses `orderId`).

- Call `useOrderShipmentTracking(orderId, true)`.
- Loading: skeleton or small spinner inside a `Card`-style block consistent with order detail styling.
- Error: inline `Alert` or muted text + optional retry (`refetch` from query).
- Success: show waybill (mono), optional `currentStatus`, then a **vertical timeline** of `scans` (map with `key` from index + timestamp + status to avoid collisions).
- Root element: `<section id="shipment-tracking" aria-labelledby="shipment-tracking-heading">` for anchor + a11y.

- [ ] **Step 4.2: Wire detail page**

In `app/orders/[id]/page.tsx`, below the existing tracking number block (or merged): if `order.tracking_number`, render `<ShipmentTrackingSection orderId={order.id} waybill={order.tracking_number} />`. If no waybill, optionally one line: “Tracking will appear after dispatch” (spec allows).

- [ ] **Step 4.3: Orders list link**

In `app/orders/page.tsx`, where `tracking_number` is shown: add `Link` “Track shipment” to ``/orders/${order.id}#shipment-tracking`` (use same wording as spec).

- [ ] **Step 4.4: Commit**

```bash
git add components/orders/ShipmentTrackingSection.tsx app/orders/\[id\]/page.tsx app/orders/page.tsx
git commit -m "feat(orders): shipment tracking UI and list link"
```

---

## Task 5: Docs + manual QA

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 5.1: Update CLAUDE.md**

Under Shipping / API routes, add:

- `GET /api/shipping/order-tracking?orderId=` — auth required; Delhivery proxy; optional `DELHIVERY_TRACKING_BASE_URL`.

- [ ] **Step 5.2: Manual QA checklist**

1. Logged out → hit API → `401`.
2. Wrong user’s `orderId` → `404`.
3. Order without `tracking_number` → `400` + UI shows no live section.
4. Order with valid waybill → timeline renders; refresh within 3 minutes uses cache (network tab).
5. Delhivery error (invalid key in dev) → user sees generic error, no stack in UI.

- [ ] **Step 5.3: Lint**

```bash
npm run lint
```

Expected: no new errors in touched files.

- [ ] **Step 5.4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: order tracking API and env in CLAUDE"
```

---

## Optional (YAGNI unless needed)

- **Rate limiting:** `order-tracking` is user-authenticated; abuse risk is lower than public pincode. Add Upstash limiter later only if needed.
- **Unit tests:** Fixture JSON from Delhivery docs → test mapper in `delhivery-package-tracking.ts`.

---

## Plan review

After implementation, optionally run a human or agent review against this plan and the spec. If Delhivery’s documented endpoint differs, update **Task 1** mapper and **Task 2** only — keep the API contract `{ tracking: OrderShipmentTrackingData }` stable for the client.
