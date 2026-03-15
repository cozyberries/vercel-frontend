# Early Bird Discount — Design Spec

**Date:** 2026-03-15
**Branch:** feature/early-bird-discount (to be created)
**Status:** Approved

---

## Overview

Apply a global 5% early bird launch discount across CozyBerries. Customers pay 5% less on all products. The discount is tied to coupon code `EARLY5`, which is pre-populated at checkout. The offer auto-expires on April 30, 2026.

**Scope:**
- Site-wide announcement bar (every page)
- Homepage early bird banner with live countdown
- Product price display (strikethrough MRP + discounted price)
- Checkout coupon field (pre-populated, read-only) + discount line item
- Server-side coupon validation before order creation
- Supabase migration to add discount columns on orders table

---

## Approach

**Hybrid (frontend config + server validation):**
A single config file drives all UI. At checkout submission, the server re-validates the coupon and recomputes the discount independently — the client-supplied total is never trusted.

---

## Section 1: Offer Config & Discount Utility

### `lib/config/offers.ts` (new file)

```ts
export interface Offer {
  code: string;
  discountRate: number;     // 0.05 = 5%
  expiresAt: Date;
  enabled: boolean;
  label: string;            // "Early Bird Offer"
  badgeText: string;        // "5% OFF"
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

### `lib/utils/discount.ts` (new file)

```ts
import { EARLY_BIRD_OFFER, Offer } from '@/lib/config/offers'

export function getActiveOffer(): Offer | null {
  const offer = EARLY_BIRD_OFFER
  if (!offer.enabled) return null
  if (new Date() > offer.expiresAt) return null
  return offer
}

export function applyDiscount(price: number, rate: number): number {
  return Math.floor(price * (1 - rate))  // Math.floor for consistency — avoids server/client rounding mismatch
}

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

---

## Section 2: UI Components

### `components/announcement-bar.tsx` (new file, `'use client'`)

- **Placement:** Inserted above the `<Header>` in `app/layout.tsx`
- **Visibility:** Only renders when `getActiveOffer()` returns non-null
- **Dismissible:** Clicking ✕ sets `localStorage['announcement-dismissed-EARLY5'] = '1'` (keyed to the offer code so future offers are not suppressed); bar does not reappear in the same browser session
- **Styling:** Boho camel `#c9a87c` background, dark brown `#3d2b1a` text
- **Copy:** `🌿 Early Bird Offer — 5% off all products · Code EARLY5 applied automatically · Ends April 30`
- **Badge:** Pill `EARLY5` in dark brown bg / cream text

### `components/early-bird-banner.tsx` (new file, `'use client'`)

- **Placement:** Inserted between `<Hero />` and the "Shop by Age" section in `app/page.tsx`
- **Visibility:** Only renders when `getActiveOffer()` returns non-null
- **Styling:** Cream gradient `#f5eee0 → #eddfc9`, terracotta `#c47c5a` accents, boho leaf decoration
- **Countdown:** Live client-side countdown (days/hrs/mins/secs) to `offer.expiresAt`
- **Copy:** `We Just Launched! · Celebrate with 5% OFF · Discount applied automatically · No code needed`
- **CTA:** `Shop the Collection →` linking to `/products`
- **Countdown boxes:** White `#fff` with `border: #d4b896`, dark brown numbers, muted taupe labels

---

## Section 3: Price Display Changes

When `getActiveOffer()` is active, all price displays show:
- **Strikethrough original price** — muted taupe `text-[#a0896e] line-through`
- **Discounted price** — terracotta `text-[#c47c5a] font-bold` as the primary price
- **Badge** — `"5% OFF"` pill in terracotta bg-`#fef3ec` text-`#c47c5a`

### Files modified

| File | Change |
|------|--------|
| `components/product-card.tsx` | Replace price block with `<DiscountedPrice price={minPrice} />` |
| `components/product-static-info.tsx` | Replace price display with `<DiscountedPrice price={product.price} />` |
| `components/product-interactions.tsx` | Replace `displayPrice` block + related products price |

### `components/discounted-price.tsx` (new shared component)

A small presentational component accepting `price: number` that internally calls `getDiscountedPrice(price)` and renders the strikethrough + discounted + badge layout. Used everywhere prices are shown.

**Cart behaviour:** Cart continues to store **original prices** (no change to `CartContext`). The discount is applied at checkout, not at add-to-cart time.

---

## Section 4: Checkout Flow

### `app/checkout/page.tsx` changes

1. **Coupon code:** `const offer = getActiveOffer()` + `const couponCode = offer?.code ?? ''` — derived constant (not state), empty when offer inactive
2. **Discount amount:** `const discountAmount = offer ? Math.floor(subtotal * offer.discountRate) : 0`
3. **Total:** `const total = subtotal - discountAmount + deliveryCharge`
4. **Free delivery threshold:** uses the **discounted subtotal** (`subtotal - discountAmount`) to determine if free delivery applies, so customers paying the discounted price still benefit from the free-delivery threshold correctly.
4. **Order summary UI additions:**
   - Coupon field row: label `"Promo Code"`, read-only input showing `EARLY5` with a green checkmark when valid
   - Discount line item: `"Discount (EARLY5)" → -₹{discountAmount}` in green between subtotal and delivery
5. **Checkout session request:** Add `coupon_code: couponCode` to the POST body

### Type changes — `lib/types/order.ts`

```ts
export interface CreateOrderRequest {
  items: OrderItemInput[]
  shipping_address_id: string
  billing_address_id?: string
  coupon_code?: string        // new
  notes?: string
}

export interface OrderBase {
  // ... existing fields ...
  discount_code?: string      // new, nullable
  discount_amount?: number    // new, nullable, default 0
}

// CheckoutSession must also carry discount fields (used by payment page):
export interface CheckoutSession {
  // ... existing fields ...
  discount_code?: string      // new
  discount_amount?: number    // new, default 0
}
```

### Tax handling

Prices throughout CozyBerries are **GST-inclusive** (confirmed by code comment: `// Display and cart use same price (GST-inclusive)`). The `tax_amount` field on orders is `0` by convention — it is not a separate line item. Therefore, **no tax recalculation is needed** when applying the discount. The 5% discount applies to the GST-inclusive subtotal as-is.

---

## Section 5: Server-Side Validation

### `app/api/checkout-sessions/route.ts` changes

On POST:
1. Extract `coupon_code` from request body
2. Import `EARLY_BIRD_OFFER` and validate: `code === offer.code && new Date() <= offer.expiresAt && offer.enabled`
3. If valid: compute `discount_amount = Math.floor(subtotal * offer.discountRate)` (matches client-side rounding)
4. Stamp `discount_code` and `discount_amount` on the checkout session record
5. The `total_amount` passed to the payment system uses the server-computed discount, never the client-supplied total
6. **Invalid coupon response:** If coupon validation fails (expired, wrong code), the API returns `422 Unprocessable Entity` with `{ error: 'invalid_coupon', message: 'This offer has expired or is invalid.' }`. The checkout page surfaces this as a `toast.error`.

### Supabase migration (new file)

`supabase/migrations/YYYYMMDDHHMMSS_add_discount_to_orders.sql`:
```sql
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_code   text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE checkout_sessions
  ADD COLUMN IF NOT EXISTS discount_code   text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;
```

If the `checkout_sessions` table does not exist in Supabase (sessions are stored only client-side), omit the second `ALTER TABLE` statement.

---

## Data Flow Summary

```
Product card / detail page
  └─ getDiscountedPrice(price) → show ~~MRP~~ discounted + badge

Cart
  └─ stores original prices (unchanged)

Checkout page
  └─ coupon = 'EARLY5' (pre-populated, read-only)
  └─ discountAmount = subtotal * 0.05 (client-side display)
  └─ total = subtotal - discountAmount + delivery
  └─ POST /api/checkout-sessions { ..., coupon_code: 'EARLY5' }

Checkout Sessions API
  └─ validates coupon server-side
  └─ recomputes discount_amount independently
  └─ persists discount_code + discount_amount on order record
  └─ payment amount uses server-computed total
```

---

## Turning Off the Offer

Set `enabled: false` in `lib/config/offers.ts`. All banners hide, prices revert to normal, coupon field disappears from checkout. No DB change required.

The offer also auto-expires on April 30, 2026 via date check in `getActiveOffer()`.

---

## Files Changed / Created

| File | Action |
|------|--------|
| `lib/config/offers.ts` | Create |
| `lib/utils/discount.ts` | Create |
| `components/announcement-bar.tsx` | Create |
| `components/early-bird-banner.tsx` | Create |
| `components/discounted-price.tsx` | Create |
| `components/product-card.tsx` | Modify |
| `components/product-static-info.tsx` | Modify |
| `components/product-interactions.tsx` | Modify |
| `app/layout.tsx` | Modify — add `<AnnouncementBar />` |
| `app/page.tsx` | Modify — add `<EarlyBirdBanner />` |
| `app/checkout/page.tsx` | Modify — coupon field + discount line |
| `lib/types/order.ts` | Modify — add discount fields |
| `app/api/checkout-sessions/route.ts` | Modify — server validation |
| `supabase/migrations/*_add_discount_to_orders.sql` | Create |
