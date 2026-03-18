# Early Bird Offer — API Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose the early bird offer as a proper API endpoint, extract shared server-side validation to eliminate duplication, fix `orders/route.ts` silently ignoring coupon codes, and wire UI components to the live API via a TanStack Query hook.

**Architecture:** A new `GET /api/offers/active` route returns the current offer state from server config. A shared server-side helper `lib/utils/offers-server.ts` owns all coupon-validation logic so both the checkout-sessions route and the orders route call the same code. UI components move from reading `NEXT_PUBLIC_` env vars directly to fetching via a `useActiveOffer()` TanStack Query hook — keeping the config as the server-side source of truth.

**Tech Stack:** Next.js 15 App Router, TypeScript, TanStack Query v5, Axios

---

## Context: What Already Exists

The original early-bird discount plan ([Early Bird Discount Implementation](../superpowers/plans/2026-03-15-early-bird-discount.md)) was largely completed. The following are already in place:

| File | State |
|------|-------|
| `lib/config/offers.ts` | ✅ Exists — reads from `NEXT_PUBLIC_` env vars |
| `lib/utils/discount.ts` | ✅ Exists — `getActiveOffer()`, `applyDiscount()`, `getDiscountedPrice()` |
| `components/discounted-price.tsx` | ✅ Exists — strikethrough price display |
| `components/announcement-bar.tsx` | ✅ Exists — uses `getActiveOffer()` directly |
| `components/early-bird-banner.tsx` | ✅ Exists — uses `getActiveOffer()` directly |
| `app/api/checkout-sessions/route.ts` | ✅ Has server-side coupon validation |
| `app/api/orders/route.ts` | ❌ **BUG**: `coupon_code` is silently ignored — discount never applied |

**The gap this plan closes:**
1. No `GET /api/offers/active` endpoint — clients are tightly coupled to build-time env vars
2. `app/api/orders/route.ts` ignores `coupon_code` entirely (the discount is only applied in checkout-sessions, not when orders are created)
3. Coupon validation logic is duplicated (only in checkout-sessions; needs to be in a shared helper for reuse)
4. No TanStack Query hook — UI components call `getActiveOffer()` synchronously from config rather than fetching from the server

---

## Task 1: Server-Side Offer Validation Helper

**Files:**
- Create: `lib/utils/offers-server.ts`

This module is **server-only** (never imported from `'use client'` code). It owns the canonical coupon validation logic so both API routes call one function.

**Step 1.1: Create `lib/utils/offers-server.ts`**

```ts
// lib/utils/offers-server.ts
import { EARLY_BIRD_OFFER } from '@/lib/config/offers'
import type { Offer } from '@/lib/config/offers'

export interface AppliedDiscount {
  discountCode: string
  discountAmount: number
  offer: Offer
}

export type OfferValidationResult =
  | { ok: true; data: AppliedDiscount }
  | { ok: false; error: string }

/**
 * Validates a coupon code against the current active offer and computes
 * the discount amount for the given subtotal.
 *
 * Returns ok:true with AppliedDiscount on success.
 * Returns ok:false with an error string when the coupon is invalid/expired.
 */
export function validateAndApplyOffer(
  couponCode: string,
  subtotalRupees: number
): OfferValidationResult {
  const offer = EARLY_BIRD_OFFER

  const isValid =
    offer.enabled &&
    couponCode.trim().toUpperCase() === offer.code.toUpperCase() &&
    new Date() <= offer.expiresAt

  if (!isValid) {
    return { ok: false, error: 'This offer has expired or is invalid.' }
  }

  return {
    ok: true,
    data: {
      discountCode: offer.code,
      discountAmount: Math.floor(subtotalRupees * offer.discountRate),
      offer,
    },
  }
}

/**
 * Returns the active server-side offer, or null if disabled/expired.
 * Use this in API routes and Server Components only.
 */
export function getActiveOfferServer(): Offer | null {
  const offer = EARLY_BIRD_OFFER
  if (!offer.enabled) return null
  if (new Date() > offer.expiresAt) return null
  return offer
}
```

**Step 1.2: Verify TypeScript compiles**

```bash
cd /Users/manishkumar/Documents/cozyburry/vercel-frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Step 1.3: Commit**

```bash
git add lib/utils/offers-server.ts
git commit -m "feat: add server-side offer validation helper (validateAndApplyOffer)"
```

---

## Task 2: `GET /api/offers/active` Endpoint

**Files:**
- Create: `app/api/offers/active/route.ts`

A public (unauthenticated) endpoint that returns the current active offer, or `{ offer: null }` when expired/disabled. Sets aggressive cache headers so CDN/browser cache it for up to 1 hour.

**Step 2.1: Create `app/api/offers/active/route.ts`**

```ts
// app/api/offers/active/route.ts
import { NextResponse } from 'next/server'
import { getActiveOfferServer } from '@/lib/utils/offers-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const offer = getActiveOfferServer()

  if (!offer) {
    return NextResponse.json(
      { offer: null },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    )
  }

  return NextResponse.json(
    {
      offer: {
        code: offer.code,
        discountRate: offer.discountRate,
        expiresAt: offer.expiresAt.toISOString(),
        label: offer.label,
        badgeText: offer.badgeText,
        enabled: offer.enabled,
      },
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    }
  )
}
```

**Step 2.2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Step 2.3: Manual curl check (dev server must be running)**

```bash
curl http://localhost:3000/api/offers/active
```

Expected output when offer is active:
```json
{
  "offer": {
    "code": "EARLY5",
    "discountRate": 0.05,
    "expiresAt": "2026-04-30T18:29:59.000Z",
    "label": "Early Bird Offer",
    "badgeText": "5% OFF",
    "enabled": true
  }
}
```

**Step 2.4: Commit**

```bash
git add app/api/offers/active/route.ts
git commit -m "feat: add GET /api/offers/active endpoint with CDN cache headers"
```

---

## Task 3: API Service Function + Type

**Files:**
- Modify: `lib/services/api.ts` — add `getActiveOfferFromApi()`
- Modify: `lib/types/order.ts` — add `ActiveOfferResponse` type (or create `lib/types/offers.ts`)

**Step 3.1: Add `ActiveOfferResponse` type**

Open `lib/types/order.ts`. At the bottom, append:

```ts
// ─── Offers ───────────────────────────────────────────────────────────────────

export interface ActiveOfferResponse {
  code: string
  discountRate: number
  expiresAt: string   // ISO string from API
  label: string
  badgeText: string
  enabled: boolean
}
```

**Step 3.2: Add `getActiveOfferFromApi()` to `lib/services/api.ts`**

Open `lib/services/api.ts`. Add this at the bottom (after the last export):

```ts
/**
 * Fetches the current active offer from the server.
 * Returns null when no offer is active.
 */
export async function getActiveOfferFromApi(): Promise<ActiveOfferResponse | null> {
  const response = await api.get<{ offer: ActiveOfferResponse | null }>(
    '/api/offers/active'
  )
  return response.data.offer
}
```

Also add the import at the top of `lib/services/api.ts` (with the other type imports):

```ts
import type { ActiveOfferResponse } from '@/lib/types/order'
```

**Step 3.3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Step 3.4: Commit**

```bash
git add lib/types/order.ts lib/services/api.ts
git commit -m "feat: add ActiveOfferResponse type and getActiveOfferFromApi service"
```

---

## Task 4: `useActiveOffer()` TanStack Query Hook

**Files:**
- Modify: `hooks/useApiQueries.ts`

**Step 4.1: Add `useActiveOffer` import and hook**

Open `hooks/useApiQueries.ts`. Add `getActiveOfferFromApi` to the import from `@/lib/services/api`:

```ts
import {
  getAgeOptions,
  getCategories,
  getFeaturedProducts,
  getCategoryOptions,
  getSizeOptions,
  getGenderOptions,
  getProducts,
  getProductById,
  getActiveOfferFromApi,
  type AgeOptionFilter,
  type CategoryOption,
  type SizeOptionFilter,
  type GenderOptionFilter,
} from "@/lib/services/api";
```

Also add the type import:

```ts
import type { ActiveOfferResponse } from "@/lib/types/order";
```

Then, append this hook after the last existing hook in the file:

```ts
/**
 * Fetches the current active offer from /api/offers/active.
 * Cached for 10 minutes — offer config rarely changes mid-session.
 * Returns null when no offer is active.
 */
export function useActiveOffer() {
  return useQuery<ActiveOfferResponse | null>({
    queryKey: ["activeOffer"],
    queryFn: () => getActiveOfferFromApi(),
    staleTime: 1000 * 60 * 10,  // 10 minutes
    gcTime: 1000 * 60 * 60,     // 1 hour
  });
}
```

**Step 4.2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Step 4.3: Commit**

```bash
git add hooks/useApiQueries.ts
git commit -m "feat: add useActiveOffer TanStack Query hook (fetches /api/offers/active)"
```

---

## Task 5: Update `announcement-bar.tsx` to use `useActiveOffer()`

**Files:**
- Modify: `components/announcement-bar.tsx`

The current component calls `getActiveOffer()` synchronously from config (NEXT_PUBLIC_ env vars). Replace it with `useActiveOffer()` from TanStack Query so it reads from the live API.

**Step 5.1: Update `components/announcement-bar.tsx`**

Replace the entire file content with:

```tsx
// components/announcement-bar.tsx
'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useActiveOffer } from '@/hooks/useApiQueries'

export default function AnnouncementBar() {
  const { data: offer } = useActiveOffer()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!offer) return
    const dismissed = localStorage.getItem(`announcement-dismissed-${offer.code}`)
    if (!dismissed) setVisible(true)
  }, [offer?.code])

  if (!offer || !visible) return null

  const handleDismiss = () => {
    localStorage.setItem(`announcement-dismissed-${offer.code}`, '1')
    setVisible(false)
  }

  return (
    <div
      style={{ background: '#c9a87c' }}
      className="w-full py-2 px-4 flex items-center justify-center gap-3 relative"
    >
      <p
        style={{ color: '#3d2b1a' }}
        className="text-sm font-medium text-center leading-tight"
      >
        🌿 {offer.label} —{' '}
        <strong>{Math.round(offer.discountRate * 100)}% off all products</strong>
        {' · '}
        <span
          style={{ background: '#3d2b1a', color: '#f5eee0' }}
          className="text-xs font-bold px-2 py-0.5 rounded-full inline-block mx-0.5"
        >
          {offer.code}
        </span>
        {' '}applied automatically
      </p>
      <button
        onClick={handleDismiss}
        style={{ color: '#3d2b1a' }}
        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss announcement"
      >
        <X size={14} />
      </button>
    </div>
  )
}
```

**Step 5.2: Verify TypeScript + lint**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Step 5.3: Commit**

```bash
git add components/announcement-bar.tsx
git commit -m "refactor: announcement-bar uses useActiveOffer hook (fetches from API)"
```

---

## Task 6: Update `early-bird-banner.tsx` to use `useActiveOffer()`

**Files:**
- Modify: `components/early-bird-banner.tsx`

**Step 6.1: Update `components/early-bird-banner.tsx`**

Replace the entire file content with:

```tsx
// components/early-bird-banner.tsx
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useActiveOffer } from '@/hooks/useApiQueries'

interface TimeLeft {
  days: number
  hrs: number
  mins: number
  secs: number
}

function getTimeLeft(expiresAt: Date): TimeLeft {
  const diff = Math.max(0, expiresAt.getTime() - Date.now())
  return {
    days: Math.floor(diff / 86400000),
    hrs:  Math.floor((diff % 86400000) / 3600000),
    mins: Math.floor((diff % 3600000) / 60000),
    secs: Math.floor((diff % 60000) / 1000),
  }
}

function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <div
      style={{ background: '#fff', border: '1px solid #d4b896' }}
      className="rounded-xl px-3 py-2.5 text-center min-w-[56px]"
    >
      <div style={{ color: '#3d2b1a' }} className="text-2xl font-extrabold leading-none">
        {String(value).padStart(2, '0')}
      </div>
      <div style={{ color: '#a0896e' }} className="text-[9px] uppercase tracking-widest mt-0.5">
        {label}
      </div>
    </div>
  )
}

export default function EarlyBirdBanner() {
  const { data: offer } = useActiveOffer()
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null)
  const [liveText, setLiveText] = useState<string>('')

  useEffect(() => {
    if (!offer) return

    const expiresAt = new Date(offer.expiresAt)

    const update = () => {
      const t = getTimeLeft(expiresAt)
      setTimeLeft(t)
      setLiveText(`${t.days} days, ${t.hrs} hours, ${t.mins} minutes remaining`)
    }

    update()
    const secondId = setInterval(() => setTimeLeft(getTimeLeft(expiresAt)), 1000)
    const minuteId = setInterval(update, 60000)
    return () => {
      clearInterval(secondId)
      clearInterval(minuteId)
    }
  }, [offer])

  if (!offer) return null

  return (
    <section
      style={{
        background: 'linear-gradient(135deg, #f5eee0 0%, #eddfc9 100%)',
        borderTop: '2px solid #c9a87c',
        borderBottom: '2px solid #c9a87c',
      }}
      className="w-full py-8 px-4"
    >
      <div className="max-w-lg mx-auto text-center">
        <div className="text-2xl mb-3 tracking-widest opacity-60" aria-hidden="true">
          🌿 ✿ 🌿
        </div>

        <p
          style={{ color: '#c47c5a' }}
          className="text-xs font-bold tracking-[0.15em] uppercase mb-1.5"
        >
          We Just Launched!
        </p>

        <h2
          style={{ color: '#3d2b1a' }}
          className="text-2xl md:text-3xl font-extrabold leading-tight mb-1"
        >
          Celebrate with{' '}
          <span
            style={{ color: '#c47c5a', borderBottom: '2px solid #c47c5a' }}
            className="inline-block"
          >
            {offer.badgeText}
          </span>
        </h2>

        <p style={{ color: '#7a5c42' }} className="text-sm mb-5">
          Discount applied automatically · No code needed
        </p>

        <span className="sr-only" aria-live="polite">{liveText}</span>

        {timeLeft && (
          <div className="flex justify-center gap-2.5 mb-6">
            <CountdownBox value={timeLeft.days} label="Days" />
            <CountdownBox value={timeLeft.hrs}  label="Hrs"  />
            <CountdownBox value={timeLeft.mins} label="Mins" />
            <CountdownBox value={timeLeft.secs} label="Secs" />
          </div>
        )}

        <Link
          href="/products"
          style={{ background: '#3d2b1a', color: '#f5eee0' }}
          className="inline-block px-7 py-2.5 rounded-full text-sm font-semibold tracking-wide hover:opacity-90 transition-opacity"
        >
          Shop the Collection →
        </Link>
      </div>
    </section>
  )
}
```

Key changes from original:
- `useActiveOffer()` instead of `getActiveOffer()` — reads from live API
- `expiresAt` is now a string from the API; parsed to `Date` inside `useEffect`
- `badgeText` is dynamic from the API response
- Countdown is restored (it was removed in a previous edit)

**Step 6.2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Step 6.3: Visual verification (dev server)**

```bash
npm run dev
```

Open http://localhost:3000. Check:
- Announcement bar still appears at top
- Homepage banner still shows with countdown ticking every second
- Dismissing announcement bar persists across page reload

**Step 6.4: Commit**

```bash
git add components/early-bird-banner.tsx
git commit -m "refactor: early-bird-banner uses useActiveOffer hook + restores countdown"
```

---

## Task 7: Refactor `checkout-sessions/route.ts` to use shared helper

**Files:**
- Modify: `app/api/checkout-sessions/route.ts`

Replace the inline coupon validation with a call to `validateAndApplyOffer`.

**Step 7.1: Update imports in `app/api/checkout-sessions/route.ts`**

Remove this import:
```ts
import { EARLY_BIRD_OFFER } from "@/lib/config/offers";
```

Replace with:
```ts
import { validateAndApplyOffer } from "@/lib/utils/offers-server";
```

**Step 7.2: Replace inline coupon validation block**

Find and replace the entire inline validation block (from `let discountCode` through `const finalTotal`):

```ts
// Before (remove this):
let discountCode: string | null = null
let discountAmount = 0

if (coupon_code) {
  const offer = EARLY_BIRD_OFFER
  const isValid =
    offer.enabled &&
    coupon_code === offer.code &&
    new Date() <= offer.expiresAt

  if (!isValid) {
    return NextResponse.json(
      { error: 'invalid_coupon', message: 'This offer has expired or is invalid.' },
      { status: 422 }
    )
  }

  discountCode = offer.code
  discountAmount = Math.floor(orderSummary.subtotal * offer.discountRate)
}

const discountedSubtotal = orderSummary.subtotal - discountAmount
const serverDeliveryCharge =
  items.length > 0 && discountedSubtotal < FREE_DELIVERY_THRESHOLD
    ? DELIVERY_CHARGE_INR
    : 0
const finalTotal = discountedSubtotal + serverDeliveryCharge
```

```ts
// After (replace with this):
let discountCode: string | null = null
let discountAmount = 0

if (coupon_code) {
  const result = validateAndApplyOffer(coupon_code, orderSummary.subtotal)
  if (!result.ok) {
    return NextResponse.json(
      { error: 'invalid_coupon', message: result.error },
      { status: 422 }
    )
  }
  discountCode = result.data.discountCode
  discountAmount = result.data.discountAmount
}

const discountedSubtotal = orderSummary.subtotal - discountAmount
const serverDeliveryCharge =
  items.length > 0 && discountedSubtotal < FREE_DELIVERY_THRESHOLD
    ? DELIVERY_CHARGE_INR
    : 0
const finalTotal = discountedSubtotal + serverDeliveryCharge
```

**Step 7.3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Step 7.4: Commit**

```bash
git add app/api/checkout-sessions/route.ts
git commit -m "refactor: checkout-sessions uses shared validateAndApplyOffer helper"
```

---

## Task 8: Fix `app/api/orders/route.ts` — Apply Discount (Critical Bug Fix)

**Files:**
- Modify: `app/api/orders/route.ts`

The `coupon_code` field on `CreateOrderRequest` is currently silently ignored. This means orders created via this route never have discounts applied — a revenue-leaking bug.

**Step 8.1: Add import to `app/api/orders/route.ts`**

At the top of the file, add alongside the existing imports:

```ts
import { validateAndApplyOffer } from "@/lib/utils/offers-server";
import { DELIVERY_CHARGE_INR, FREE_DELIVERY_THRESHOLD } from "@/lib/constants";
```

**Step 8.2: Extract `coupon_code` from request body**

Find:
```ts
const { items, shipping_address_id, billing_address_id, notes } = body;
```

Replace with:
```ts
const { items, shipping_address_id, billing_address_id, coupon_code, notes } = body;
```

**Step 8.3: Add discount computation after `calculateOrderSummary`**

Find:
```ts
const orderSummary = calculateOrderSummary(items);
const { shippingAddress, billingAddress, shippingRow } = addressResult.data;
```

Replace with:
```ts
const orderSummary = calculateOrderSummary(items);

let discountCode: string | null = null
let discountAmount = 0

if (coupon_code) {
  const result = validateAndApplyOffer(coupon_code, orderSummary.subtotal)
  if (!result.ok) {
    return NextResponse.json(
      { error: 'invalid_coupon', message: result.error },
      { status: 422 }
    )
  }
  discountCode = result.data.discountCode
  discountAmount = result.data.discountAmount
}

const discountedSubtotal = orderSummary.subtotal - discountAmount
const serverDeliveryCharge =
  items.length > 0 && discountedSubtotal < FREE_DELIVERY_THRESHOLD
    ? DELIVERY_CHARGE_INR
    : 0
const finalTotal = discountedSubtotal + serverDeliveryCharge

const { shippingAddress, billingAddress, shippingRow } = addressResult.data;
```

**Step 8.4: Update `orderData` to include discount fields and corrected totals**

Find the `orderData` object construction:

```ts
const orderData: OrderCreate = {
  user_id: user.id,
  customer_email: email,
  customer_phone: shippingRow.phone,
  shipping_address: shippingAddress,
  billing_address: billingAddress,
  subtotal: orderSummary.subtotal,
  delivery_charge: orderSummary.delivery_charge,
  tax_amount: orderSummary.tax_amount,
  total_amount: orderSummary.total_amount,
  currency: orderSummary.currency,
  notes,
};
```

Replace with:

```ts
const orderData: OrderCreate = {
  user_id: user.id,
  customer_email: email,
  customer_phone: shippingRow.phone,
  shipping_address: shippingAddress,
  billing_address: billingAddress,
  subtotal: orderSummary.subtotal,
  discount_code: discountCode ?? undefined,
  discount_amount: discountAmount,
  delivery_charge: serverDeliveryCharge,
  tax_amount: orderSummary.tax_amount,
  total_amount: finalTotal,
  currency: orderSummary.currency,
  notes,
};
```

**Step 8.5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Step 8.6: Commit**

```bash
git add app/api/orders/route.ts
git commit -m "fix: apply coupon discount in orders/route.ts (was silently ignored)"
```

---

## Task 9: End-to-End Verification

**Step 9.1: Start dev server**

```bash
npm run dev
```

**Step 9.2: Verify `/api/offers/active` response**

```bash
curl -s http://localhost:3000/api/offers/active | python3 -m json.tool
```

Expected: JSON with `offer.code = "EARLY5"` and `offer.discountRate = 0.05`.

**Step 9.3: Verify announcement bar still renders**

Open http://localhost:3000. Confirm:
- Camel announcement bar at the top
- Bar uses live `discountRate` from the API (shows "5% off")
- Dismiss still works

**Step 9.4: Verify homepage countdown banner**

On http://localhost:3000:
- Countdown banner visible between hero and Shop by Age
- Countdown ticks every second
- `badgeText` ("5% OFF") displayed dynamically from API

**Step 9.5: Verify TypeScript across the whole project**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

**Step 9.6: Verify lint**

```bash
npm run lint 2>&1 | tail -20
```

Expected: no new lint errors.

**Step 9.7: Final commit**

```bash
git add -A
git status
git commit -m "feat: earlybird offer API layer — GET /api/offers/active, shared validation, fix orders route"
```

---

## Summary of All Changes

| File | Action | Why |
|------|--------|-----|
| `lib/utils/offers-server.ts` | **Create** | Shared server-side validation helper (DRY) |
| `app/api/offers/active/route.ts` | **Create** | Public API endpoint; clients no longer depend on build-time env vars |
| `lib/types/order.ts` | **Modify** | Add `ActiveOfferResponse` interface |
| `lib/services/api.ts` | **Modify** | Add `getActiveOfferFromApi()` service function |
| `hooks/useApiQueries.ts` | **Modify** | Add `useActiveOffer()` TanStack Query hook |
| `components/announcement-bar.tsx` | **Modify** | Switch from `getActiveOffer()` config to `useActiveOffer()` hook |
| `components/early-bird-banner.tsx` | **Modify** | Switch from `getActiveOffer()` config to `useActiveOffer()` hook; restore countdown |
| `app/api/checkout-sessions/route.ts` | **Modify** | Use shared `validateAndApplyOffer` (removes inline duplicate logic) |
| `app/api/orders/route.ts` | **Modify** | **Critical bug fix**: actually applies the discount (was silently ignored) |

No database migrations needed — the `discount_code` and `discount_amount` columns were added in the original plan's migration.
