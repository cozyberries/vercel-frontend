# Early Bird Discount Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global 5% early bird discount with coupon code EARLY5, auto-expiring April 30 2026, with a site-wide announcement bar, homepage countdown banner, strikethrough pricing on all product displays, and server-side validated discount at checkout.

**Architecture:** A single config file (`lib/config/offers.ts`) is the source of truth for the offer. A shared utility (`lib/utils/discount.ts`) and presentational component (`components/discounted-price.tsx`) propagate the discount to all price displays. The checkout page pre-populates the coupon code and shows a discount line item; the checkout sessions API validates the coupon server-side before persisting the session.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS, shadcn/ui, Supabase

> **Note on testing:** This project skips unit/E2E tests per project conventions. Each task ends with a visual verification step using `npm run dev` and manual inspection.

---

## Chunk 1: Foundation, Components, and Wiring

### Task 1: Offer Config + Discount Utility

**Files:**
- Create: `lib/config/offers.ts`
- Create: `lib/utils/discount.ts`

- [ ] **Step 1.1: Create `lib/config/offers.ts`**

```ts
// lib/config/offers.ts
export interface Offer {
  code: string
  discountRate: number   // 0.05 = 5%
  expiresAt: Date
  enabled: boolean
  label: string          // displayed in UI e.g. "Early Bird Offer"
  badgeText: string      // e.g. "5% OFF"
}

export const EARLY_BIRD_OFFER: Offer = {
  code: 'EARLY5',
  discountRate: 0.05,
  expiresAt: new Date('2026-04-30T23:59:59+05:30'),
  enabled: true,
  label: 'Early Bird Offer',
  badgeText: '5% OFF',
}
```

- [ ] **Step 1.2: Create `lib/utils/discount.ts`**

```ts
// lib/utils/discount.ts
import { EARLY_BIRD_OFFER, type Offer } from '@/lib/config/offers'

/**
 * Returns the active offer if enabled and not expired, otherwise null.
 * Call this wherever offer-gated UI or logic is needed.
 */
export function getActiveOffer(): Offer | null {
  const offer = EARLY_BIRD_OFFER
  if (!offer.enabled) return null
  if (new Date() > offer.expiresAt) return null
  return offer
}

/**
 * Apply a discount rate to a price using Math.floor for consistent
 * client/server rounding (avoids ₹1 discrepancies).
 */
export function applyDiscount(price: number, rate: number): number {
  return Math.floor(price * (1 - rate))
}

/**
 * Returns display-ready price info for a given price.
 * When no offer is active, discounted === original and savings === 0.
 */
export function getDiscountedPrice(price: number): {
  original: number
  discounted: number
  savings: number
  offer: Offer | null
} {
  const offer = getActiveOffer()
  if (!offer) return { original: price, discounted: price, savings: 0, offer: null }
  const discounted = applyDiscount(price, offer.discountRate)
  return { original: price, discounted, savings: price - discounted, offer }
}
```

- [ ] **Step 1.3: Verify TypeScript compiles**

```bash
cd /Users/abdul.azeez/Personal/cozyberries/vercel-frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to the two new files.

- [ ] **Step 1.4: Commit**

```bash
git add lib/config/offers.ts lib/utils/discount.ts
git commit -m "feat: add early bird offer config and discount utility"
```

---

### Task 2: DiscountedPrice Component

**Files:**
- Create: `components/discounted-price.tsx`

This is a small `'use client'` presentational component. It accepts a `price` (the original price), calls `getDiscountedPrice`, and renders the strikethrough + discount + badge layout when an offer is active, or a plain price when not.

- [ ] **Step 2.1: Create `components/discounted-price.tsx`**

```tsx
// components/discounted-price.tsx
'use client'

import { getDiscountedPrice } from '@/lib/utils/discount'

interface DiscountedPriceProps {
  price: number
  /** When true, shows "Starts at" prefix (for range-priced products on listing cards) */
  showStartsAt?: boolean
  className?: string
}

export default function DiscountedPrice({
  price,
  showStartsAt = false,
  className = '',
}: DiscountedPriceProps) {
  const { original, discounted, offer } = getDiscountedPrice(price)

  if (!offer) {
    return (
      <span className={`font-bold text-gray-900 ${className}`}>
        {showStartsAt && (
          <span className="text-xs font-medium text-gray-500 mr-1">Starts at</span>
        )}
        ₹{discounted.toFixed(0)}
      </span>
    )
  }

  return (
    <span className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      {showStartsAt && (
        <span className="text-xs font-medium text-gray-500">Starts at</span>
      )}
      <span className="text-[#a0896e] line-through text-sm">
        ₹{original.toFixed(0)}
      </span>
      <span className="font-bold text-[#c47c5a]">
        ₹{discounted.toFixed(0)}
      </span>
      <span className="bg-[#fef3ec] text-[#c47c5a] text-[10px] font-bold px-1.5 py-0.5 rounded-full">
        {offer.badgeText}
      </span>
    </span>
  )
}
```

- [ ] **Step 2.2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
git add components/discounted-price.tsx
git commit -m "feat: add DiscountedPrice component for strikethrough discount display"
```

---

### Task 3: Announcement Bar (site-wide)

**Files:**
- Create: `components/announcement-bar.tsx`

Slim bar rendered above the header on every page. Client component (uses localStorage). Auto-hides when offer expires. Dismissible per-browser with a localStorage key scoped to the offer code.

- [ ] **Step 3.1: Create `components/announcement-bar.tsx`**

```tsx
// components/announcement-bar.tsx
'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { getActiveOffer } from '@/lib/utils/discount'

export default function AnnouncementBar() {
  const [visible, setVisible] = useState(false)
  const offer = getActiveOffer()

  useEffect(() => {
    if (!offer) return
    const dismissed = localStorage.getItem(`announcement-dismissed-${offer.code}`)
    if (!dismissed) setVisible(true)
  }, [offer])

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
        <strong>5% off all products</strong>
        {' · '}
        <span
          style={{ background: '#3d2b1a', color: '#f5eee0' }}
          className="text-xs font-bold px-2 py-0.5 rounded-full inline-block mx-0.5"
        >
          {offer.code}
        </span>
        {' '}applied automatically · Ends April&nbsp;30
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

- [ ] **Step 3.2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3.3: Commit**

```bash
git add components/announcement-bar.tsx
git commit -m "feat: add AnnouncementBar component (boho camel, dismissible, auto-expires)"
```

---

### Task 4: Early Bird Banner (homepage countdown)

**Files:**
- Create: `components/early-bird-banner.tsx`

Homepage-only section between Hero and Shop by Age. Shows a live countdown to the offer expiry date. Boho cream palette, terracotta accents.

- [ ] **Step 4.1: Create `components/early-bird-banner.tsx`**

```tsx
// components/early-bird-banner.tsx
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getActiveOffer } from '@/lib/utils/discount'

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
  const offer = getActiveOffer()
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null)

  useEffect(() => {
    if (!offer) return
    setTimeLeft(getTimeLeft(offer.expiresAt))
    const id = setInterval(() => setTimeLeft(getTimeLeft(offer.expiresAt)), 1000)
    return () => clearInterval(id)
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
        {/* Boho decoration */}
        <div className="text-2xl mb-3 tracking-widest opacity-60" aria-hidden>
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
            5% OFF
          </span>
        </h2>

        <p style={{ color: '#7a5c42' }} className="text-sm mb-5">
          Discount applied automatically · No code needed
        </p>

        {/* Countdown */}
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

- [ ] **Step 4.2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4.3: Commit**

```bash
git add components/early-bird-banner.tsx
git commit -m "feat: add EarlyBirdBanner with live countdown (boho palette)"
```

---

### Task 5: Wire Banners into Layout and Homepage

**Files:**
- Modify: `components/ConditionalLayout.tsx`  ← announcement bar goes here, NOT layout.tsx
- Modify: `app/page.tsx`

- [ ] **Step 5.1: Add `AnnouncementBar` to `components/ConditionalLayout.tsx`**

`ConditionalLayout` is the component that renders `<Header />` on every page. Placing the bar here (before `<Header />`) keeps it semantically grouped with the header and ensures it follows any future conditional routing logic.

Open `components/ConditionalLayout.tsx`. Add the import at the top:
```tsx
import AnnouncementBar from '@/components/announcement-bar'
```

In the JSX return, add `<AnnouncementBar />` as the first child of the outer `<div>`, before `<Header />`:

```tsx
return (
  <div className="flex min-h-screen flex-col">
    <AnnouncementBar />
    <Header />
    <main className="flex-1 pb-16 lg:pb-0">{children}</main>
    <Footer />
    <MobileBottomHeader />
  </div>
)
```

- [ ] **Step 5.2: Add `EarlyBirdBanner` to `app/page.tsx`**

Open `app/page.tsx`. Add the import:
```tsx
import EarlyBirdBanner from '@/components/early-bird-banner'
```

Insert `<EarlyBirdBanner />` between `<Hero />` and the "Shop by Age" section:

```tsx
<Hero />
<EarlyBirdBanner />

{/* Shop by Age */}
<section className="lg:py-14 py-8 bg-[#f9f7f4] ...">
```

- [ ] **Step 5.3: Start dev server and visually verify**

```bash
npm run dev
```

Open http://localhost:3000. Verify:
- [ ] Camel-coloured announcement bar appears at the very top of every page
- [ ] Clicking ✕ dismisses it (page reload should not show it again in the same browser)
- [ ] Homepage shows the cream countdown banner between the hero image and "Shop by Age"
- [ ] Countdown timer ticks every second
- [ ] On http://localhost:3000/products the announcement bar appears but no homepage banner

- [ ] **Step 5.4: Commit**

```bash
git add components/ConditionalLayout.tsx app/page.tsx
git commit -m "feat: wire AnnouncementBar (ConditionalLayout) and EarlyBirdBanner (homepage)"
```

---

> **Note on `product-static-info.tsx`:** This file is deliberately excluded from price display changes. A grep of the file confirms it contains no price rendering — only a "Free shipping over ₹X" label. All interactive price display on the product detail page is handled by `product-interactions.tsx` (Task 7).

### Task 6: Product Price Display — product-card.tsx

**Files:**
- Modify: `components/product-card.tsx`

The price block is in the "Content Section" at the bottom of the card JSX (around the `{/* Category and Price */}` comment). It currently uses `formatPrice(minPrice, locale, currency)` with a "Starts at" prefix for range products. Replace it with `<DiscountedPrice>`.

- [ ] **Step 6.1: Add import to `components/product-card.tsx`**

Add at the top of the file, near the other component imports:
```tsx
import DiscountedPrice from '@/components/discounted-price'
```

- [ ] **Step 6.2: Replace the price `<p>` element**

Find the `<p>` element that renders the price (it contains `formatPrice(minPrice, locale, currency)` and the "Starts at" span). Replace the entire `<p>` element with:

```tsx
<DiscountedPrice price={minPrice} showStartsAt={hasRange} />
```

> **Note on locale/currency:** `DiscountedPrice` uses a hardcoded `₹` symbol instead of `formatPrice(locale, currency)`. This is intentional — CozyBerries is an INR-only store and all prices are in Indian Rupees. The `locale`/`currency` props on `ProductCard` were aspirational scaffolding; no other currency has ever been used. Replacing `formatPrice` with `₹{value.toFixed(0)}` is the intentional final state.

The element to replace looks like:
```tsx
<p className="flex items-center justify-end gap-2 text-sm font-bold text-gray-900 group-hover:text-primary transition-colors duration-200 flex-shrink-0">
  {hasRange ? (
    <>
      <span className="text-xs lg:text-[10px] font-medium text-gray-500">Starts at</span>
      {formatPrice(minPrice, locale, currency)}
    </>
  ) : (
    formatPrice(minPrice, locale, currency)
  )}
</p>
```

- [ ] **Step 6.3: Verify TypeScript + visual check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Open http://localhost:3000 (dev server running). Verify:
- [ ] Product cards on the homepage featured section show strikethrough original price + discounted price in terracotta + "5% OFF" badge
- [ ] Products page grid shows the same
- [ ] "Starts at" products still show the prefix

- [ ] **Step 6.4: Commit**

```bash
git add components/product-card.tsx
git commit -m "feat: use DiscountedPrice in product card (strikethrough + 5% badge)"
```

---

### Task 7: Product Price Display — product-interactions.tsx

**Files:**
- Modify: `components/product-interactions.tsx`

Two price displays to update:
1. **Main price block** (around line 523) — the `displayPrice` shown after selecting a size
2. **Related products price** (around line 823) — the `relatedProduct.price` in the related products grid

- [ ] **Step 7.1: Add import to `components/product-interactions.tsx`**

```tsx
import DiscountedPrice from '@/components/discounted-price'
```

- [ ] **Step 7.2: Replace main price block (around line 523)**

Find the `{/* Price */}` comment block. It currently reads:
```tsx
{/* Price */}
<div ...>
  ₹{displayPrice.toFixed(0)}
  {selectedSize && selectedSize.price < product.price && (
    <span ...>
      ₹{product.price.toFixed(0)}
    </span>
  )}
</div>
```

Replace the contents of the price `<div>` with:
```tsx
{/* Price */}
<div className="flex items-center gap-2 flex-wrap">
  <DiscountedPrice price={displayPrice} />
</div>
```

Note: The existing `selectedSize.price < product.price` strikethrough was for variant-level discounts. `DiscountedPrice` now handles all discount display via the global offer, so the old conditional strikethrough is replaced.

- [ ] **Step 7.3: Replace related products price (around line 823)**

Find:
```tsx
<p className="font-medium">₹{relatedProduct.price.toFixed(0)}</p>
```

Replace with:
```tsx
<DiscountedPrice price={relatedProduct.price} />
```

- [ ] **Step 7.4: Verify TypeScript + visual check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Open http://localhost:3000/products and click a product. Verify:
- [ ] Product detail page shows strikethrough original price + discounted price + badge
- [ ] Changing size (if applicable) updates the discounted price correctly
- [ ] Related products at the bottom of the detail page show discounted prices

- [ ] **Step 7.5: Commit**

```bash
git add components/product-interactions.tsx
git commit -m "feat: use DiscountedPrice in product interactions (detail page + related products)"
```

---

## Chunk 2: Checkout, API, and Database

### Task 8: Type Changes — lib/types/order.ts

**Files:**
- Modify: `lib/types/order.ts`

Add optional discount fields to `CreateOrderRequest`, `OrderBase`, and `CheckoutSession`.

- [ ] **Step 8.1: Add `coupon_code` to `CreateOrderRequest`**

Find:
```ts
export interface CreateOrderRequest {
  items: OrderItemInput[]
  shipping_address_id: string
  billing_address_id?: string
  notes?: string
}
```

Replace with:
```ts
export interface CreateOrderRequest {
  items: OrderItemInput[]
  shipping_address_id: string
  billing_address_id?: string
  coupon_code?: string
  notes?: string
}
```

- [ ] **Step 8.2: Add discount fields to `OrderBase`**

Find the `OrderBase` interface. Add these two optional fields at the end (before the closing brace):
```ts
  discount_code?: string
  discount_amount?: number
```

- [ ] **Step 8.3: Add discount fields to `CheckoutSession`**

Find the `CheckoutSession` interface. Add these two optional fields at the end (before the closing brace):
```ts
  discount_code?: string
  discount_amount?: number
```

- [ ] **Step 8.4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 8.5: Commit**

```bash
git add lib/types/order.ts
git commit -m "feat: add discount_code and discount_amount fields to order types"
```

---

### Task 9: Checkout Page — Coupon Field + Discount Line

**Files:**
- Modify: `app/checkout/page.tsx`

Add offer-awareness to the checkout page: derive the coupon code from the active offer, compute the discount amount, show a promo code row, show a discount line item in the order summary, and pass `coupon_code` in the checkout session request.

- [ ] **Step 9.1: Add import to `app/checkout/page.tsx`**

Add at the top:
```tsx
import { getActiveOffer } from '@/lib/utils/discount'
```

- [ ] **Step 9.2: Derive offer, coupon code, and discount amount**

Find the section where `subtotal`, `deliveryCharge`, and `total` are computed (around line 130 of checkout/page.tsx):
```tsx
const subtotal = cart.reduce(...)
const deliveryCharge = ...
const total = subtotal + deliveryCharge
```

Replace with:
```tsx
const subtotal = cart.reduce(
  (sum, item) => sum + item.price * item.quantity,
  0
)
const offer = getActiveOffer()
const couponCode = offer?.code ?? ''
const discountAmount = offer ? Math.floor(subtotal * offer.discountRate) : 0
const discountedSubtotal = subtotal - discountAmount
const deliveryCharge =
  cart.length > 0 && discountedSubtotal < FREE_DELIVERY_THRESHOLD
    ? DELIVERY_CHARGE_INR
    : 0
const total = discountedSubtotal + deliveryCharge
```

- [ ] **Step 9.3: Add promo code row + discount line item to the Order Summary JSX**

In the "Order Totals" section, find the subtotal row:
```tsx
<div className="flex justify-between text-sm">
  <span>Subtotal</span>
  <span>₹{subtotal.toFixed(0)}</span>
</div>
```

After it, add the discount line (conditional on offer being active):
```tsx
{offer && discountAmount > 0 && (
  <>
    <div className="flex justify-between text-sm items-center">
      <span className="text-muted-foreground">Promo Code</span>
      <span className="flex items-center gap-1.5">
        <span className="bg-[#f5eee0] text-[#3d2b1a] text-xs font-bold px-2 py-0.5 rounded-full border border-[#c9a87c]">
          {couponCode}
        </span>
        <span className="text-green-600 text-xs">✓ Applied</span>
      </span>
    </div>
    <div className="flex justify-between text-sm text-green-600">
      <span>Discount ({offer.badgeText})</span>
      <span>-₹{discountAmount.toFixed(0)}</span>
    </div>
  </>
)}
```

- [ ] **Step 9.4: Pass `coupon_code` in the checkout session POST**

Find the `fetch('/api/checkout-sessions', ...)` call. In the JSON body, add `coupon_code`:
```ts
body: JSON.stringify({
  items: cart.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    ...(item.size ? { size: item.size } : {}),
    ...(item.color ? { color: item.color } : {}),
  })),
  shipping_address_id: selectedAddressId,
  ...(couponCode ? { coupon_code: couponCode } : {}),
  notes: formData.notes || undefined,
}),
```

- [ ] **Step 9.5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 9.6: Visual check**

Open http://localhost:3000/checkout. Verify:
- [ ] "Promo Code" row shows EARLY5 badge with green checkmark
- [ ] "Discount (5% OFF)" row shows a green negative amount
- [ ] Total is 5% less than subtotal + delivery
- [ ] If free delivery threshold is at stake, it uses the discounted subtotal

- [ ] **Step 9.7: Commit**

```bash
git add app/checkout/page.tsx
git commit -m "feat: add coupon code display and discount line item to checkout page"
```

---

### Task 10: Checkout Sessions API — Server-Side Validation

**Files:**
- Modify: `app/api/checkout-sessions/route.ts`

After `calculateOrderSummary`, validate the coupon server-side and override `total_amount` with the server-computed discounted total. Stamp `discount_code` and `discount_amount` on the session record.

- [ ] **Step 10.1: Add imports to `app/api/checkout-sessions/route.ts`**

Add at the top:
```ts
import { EARLY_BIRD_OFFER } from '@/lib/config/offers'
import { DELIVERY_CHARGE_INR, FREE_DELIVERY_THRESHOLD } from '@/lib/constants'
```

- [ ] **Step 10.2: Extract `coupon_code` from the request body**

Find the destructuring:
```ts
const { items, shipping_address_id, billing_address_id, notes } = body;
```

Replace with:
```ts
const { items, shipping_address_id, billing_address_id, coupon_code, notes } = body;
```

- [ ] **Step 10.3: Validate coupon and compute discount after `calculateOrderSummary`**

Find:
```ts
const orderSummary = calculateOrderSummary(items);
```

After it, add:
```ts
// Validate coupon and compute server-side discount
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

// Recompute total with discount applied
const discountedSubtotal = orderSummary.subtotal - discountAmount
const serverDeliveryCharge =
  items.length > 0 && discountedSubtotal < FREE_DELIVERY_THRESHOLD
    ? DELIVERY_CHARGE_INR
    : 0
const finalTotal = discountedSubtotal + serverDeliveryCharge
```

- [ ] **Step 10.4: Stamp discount fields on the session insert**

Find the `supabase.from('checkout_sessions').insert({...})` call. Add the discount fields:
```ts
.insert({
  user_id: user.id,
  customer_email: email,
  customer_phone: shippingRow.phone,
  shipping_address: shippingAddress,
  billing_address: billingAddress,
  items,
  subtotal: orderSummary.subtotal,
  delivery_charge: serverDeliveryCharge,
  tax_amount: orderSummary.tax_amount,
  total_amount: finalTotal,
  discount_code: discountCode,
  discount_amount: discountAmount,
  currency: orderSummary.currency,
  notes: notes || null,
  status: 'pending',
})
```

- [ ] **Step 10.5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors. (The Supabase types may warn about unknown columns until after migration — that's OK for now.)

- [ ] **Step 10.6: Commit**

```bash
git add app/api/checkout-sessions/route.ts
git commit -m "feat: validate EARLY5 coupon server-side and apply discount to checkout session total"
```

---

### Task 11: Supabase Migration

**Files:**
- Create: `supabase/migrations/<timestamp>_add_discount_to_orders.sql`

Add `discount_code` and `discount_amount` columns to the `orders` and `checkout_sessions` tables.

- [ ] **Step 11.1: Generate migration filename**

```bash
date -u +"%Y%m%d%H%M%S"
```

Note the output (e.g. `20260315120000`). Use it in the filename below.

- [ ] **Step 11.2: Create migration file**

Create `supabase/migrations/20260315120000_add_discount_to_orders.sql` (replace timestamp with actual output from step 11.1):

```sql
-- Add discount tracking columns to orders and checkout_sessions tables.
-- discount_code: which promo code was applied (nullable — no discount if NULL)
-- discount_amount: INR amount deducted (0 by default)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_code   text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE checkout_sessions
  ADD COLUMN IF NOT EXISTS discount_code   text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;
```

- [ ] **Step 11.3: Apply migration to Supabase**

If using the Supabase CLI:
```bash
npx supabase db push
```

If applying manually: open the Supabase dashboard → SQL Editor, paste the SQL above, and run it.

- [ ] **Step 11.4: Verify columns exist**

In the Supabase dashboard, open Table Editor → `orders` table. Confirm `discount_code` and `discount_amount` columns are present.

- [ ] **Step 11.5: Commit migration file**

```bash
git add supabase/migrations/
git commit -m "feat: add discount_code and discount_amount columns to orders and checkout_sessions"
```

---

### Task 12: End-to-End Smoke Test

Manual walkthrough to confirm the full discount flow works together.

- [ ] **Step 12.1: Verify announcement bar**
  - Open http://localhost:3000 — camel bar at top, dismiss it, refresh — bar gone
  - Open another page (e.g. /products) — bar appears (different page, not dismissed yet in private mode)

- [ ] **Step 12.2: Verify homepage banner**
  - Homepage shows cream countdown banner between hero and Shop by Age
  - Countdown ticks every second

- [ ] **Step 12.3: Verify product listing prices**
  - Go to http://localhost:3000/products
  - Every product card shows strikethrough original price + terracotta discounted price + "5% OFF" badge

- [ ] **Step 12.4: Verify product detail prices**
  - Click a product
  - Main price shows discount
  - Changing size updates the discounted price
  - Related products at bottom show discounted prices

- [ ] **Step 12.5: Verify checkout discount**
  - Add a product to cart, go to checkout
  - Order summary shows "Promo Code: EARLY5 ✓ Applied"
  - Order summary shows "Discount (5% OFF): -₹XX" in green
  - Total is 5% less than original subtotal + delivery

- [ ] **Step 12.6: Verify offer auto-expiry**
  - Temporarily change `expiresAt` in `lib/config/offers.ts` to a past date:
    `expiresAt: new Date('2020-01-01T00:00:00+05:30')`
  - Restart dev server (`npm run dev`)
  - Confirm: announcement bar gone, homepage banner gone, prices back to normal, checkout has no promo field
  - Revert the change to the original `2026-04-30` date

- [ ] **Step 12.7: Final commit**

```bash
git add -A
git status  # confirm only expected files changed
git commit -m "feat: early bird discount — full implementation complete"
```

---

## Summary of All Files

| File | Action |
|------|--------|
| `lib/config/offers.ts` | Create |
| `lib/utils/discount.ts` | Create |
| `components/discounted-price.tsx` | Create |
| `components/announcement-bar.tsx` | Create |
| `components/early-bird-banner.tsx` | Create |
| `components/product-card.tsx` | Modify — replace price block |
| `components/product-interactions.tsx` | Modify — replace main price + related products price |
| `components/ConditionalLayout.tsx` | Modify — add `<AnnouncementBar />` before `<Header />` |
| `app/page.tsx` | Modify — add `<EarlyBirdBanner />` |
| `app/checkout/page.tsx` | Modify — coupon + discount line + totals |
| `lib/types/order.ts` | Modify — add discount fields to 3 interfaces |
| `app/api/checkout-sessions/route.ts` | Modify — server coupon validation |
| `supabase/migrations/*_add_discount_to_orders.sql` | Create |
