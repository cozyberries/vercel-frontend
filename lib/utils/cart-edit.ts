import type { CartItem } from "@/components/cart-context";
import type { PendingAuthIntent } from "@/lib/auth/pending-auth-intent";

/**
 * Editing one product's cart lines from outside /cart: the size picker on
 * product cards and the product page's quantity control.
 *
 * Counts are keyed by size, with "" for a product that has no sizes, matching
 * the cart's own line key (product + size, see `getCartItemKey`).
 */
export type SizeCounts = Record<string, number>;

export type CartChange =
  | { kind: "add"; size: string; quantity: number }
  | { kind: "update"; size: string; from: number; quantity: number }
  | { kind: "remove"; size: string; from: number };

export type CartEditOutcome = "none" | "added" | "updated" | "removed";

/** One buyable size of a product, as the picker lists it. */
export interface SizeOption {
  size?: string;
  color?: string;
  price: number;
  label: string;
  stock: number;
}

export const sizeKey = (size?: string | null): string => size ?? "";

const total = (counts: SizeCounts): number =>
  Object.values(counts).reduce((sum, n) => sum + n, 0);

const isInCart = (current: SizeCounts, size: string): boolean => (current[size] ?? 0) > 0;

export function cartCountsFor(cart: CartItem[], productId: string): SizeCounts {
  const counts: SizeCounts = {};
  for (const item of cart) {
    if (item.id !== productId) continue;
    const key = sizeKey(item.size);
    counts[key] = (counts[key] ?? 0) + item.quantity;
  }
  return counts;
}

/** The count a size will have once the draft is saved. */
export function quantityInDraft(current: SizeCounts, draft: SizeCounts, size: string): number {
  return draft[size] ?? current[size] ?? 0;
}

/**
 * Tapping a size. A size already in the cart is only selected; its count is
 * edited with the stepper. Between sizes that are not in the cart yet the
 * pick moves, quantity and all, the way the add-only picker always worked,
 * so tapping around never adds two sizes by accident.
 */
export function pickSize(current: SizeCounts, draft: SizeCounts, size: string, stock: number): SizeCounts {
  if (isInCart(current, size)) return draft;
  const next = { ...draft };
  let carried = next[size] ?? 0;
  for (const key of Object.keys(next)) {
    if (key === size || isInCart(current, key) || next[key] <= 0) continue;
    if (!carried) carried = next[key];
    delete next[key];
  }
  next[size] = Math.min(carried || 1, stock);
  return next;
}

/**
 * One tap of − or +. Out of range leaves the count as it is, except that a
 * count already above `max` (stock fell after it was added) may still come down.
 */
export function stepQuantity(quantity: number, delta: 1 | -1, min: number, max: number): number {
  const next = quantity + delta;
  if (next < min) return quantity;
  if (delta > 0 && next > max) return quantity;
  return next;
}

/**
 * The stepper in the picker. Once anything of the product is in the cart a
 * size can go down to 0, which removes it; before that the floor stays 1.
 */
export function stepSize(
  current: SizeCounts,
  draft: SizeCounts,
  size: string,
  delta: 1 | -1,
  stock: number,
): SizeCounts {
  const quantity = quantityInDraft(current, draft, size);
  const next = stepQuantity(quantity, delta, total(current) > 0 ? 0 : 1, stock);
  return next === quantity ? draft : { ...draft, [size]: next };
}

export function diffCartDraft(current: SizeCounts, draft: SizeCounts): CartChange[] {
  const changes: CartChange[] = [];
  for (const [size, quantity] of Object.entries(draft)) {
    const from = current[size] ?? 0;
    if (quantity === from) continue;
    if (from === 0) changes.push({ kind: "add", size, quantity });
    else if (quantity === 0) changes.push({ kind: "remove", size, from });
    else changes.push({ kind: "update", size, from, quantity });
  }
  return changes;
}

/** Drives the picker's button label and the toast after saving. */
export function cartEditOutcome(current: SizeCounts, draft: SizeCounts): CartEditOutcome {
  if (diffCartDraft(current, draft).length === 0) return "none";
  if (total(current) === 0) return "added";
  const after = total({ ...current, ...draft });
  return after === 0 ? "removed" : "updated";
}

export function cartEditMessage(productName: string, outcome: Exclude<CartEditOutcome, "none">): string {
  if (outcome === "added") return `${productName} added to cart!`;
  return outcome === "removed" ? `${productName} removed from cart` : `${productName} updated in cart`;
}

/**
 * The product page acts on the selected size only: its quantity control starts
 * at the count in the cart, and the sticky button follows what it now says.
 */
export function inPlaceCartAction(inCart: number, quantity: number): "add" | "go-to-cart" | "update" | "remove" {
  if (inCart === 0) return "add";
  if (quantity === 0) return "remove";
  return quantity === inCart ? "go-to-cart" : "update";
}

export interface CartEditTarget {
  product: { id: string; name: string; image?: string };
  options: SizeOption[];
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  updateQuantity: (id: string, quantity: number, size?: string) => void;
  removeFromCart: (id: string, size?: string, color?: string) => void;
  requireAuthForIntent: (intent: PendingAuthIntent) => boolean;
}

/**
 * Applies the changes to the cart. New sizes go through the auth gate like
 * every other add; lowering and removing act directly, as they do on /cart.
 * Returns false when the gate took over an add (a guest, or auth still
 * loading), so the caller can skip its toast.
 */
export function applyCartChanges(changes: CartChange[], target: CartEditTarget): boolean {
  const { product, options, cart } = target;
  let ranHere = true;

  for (const change of changes) {
    // One line per product + size: the cart keys lines that way and folds older duplicates on load.
    const existing = cart.find((item) => item.id === product.id && sizeKey(item.size) === change.size);

    if (change.kind === "remove") {
      if (existing) target.removeFromCart(existing.id, existing.size, existing.color);
      continue;
    }

    if (change.kind === "update" && existing) {
      target.updateQuantity(existing.id, change.quantity, existing.size);
      continue;
    }

    const option = options.find((o) => sizeKey(o.size) === change.size);
    if (!option) continue;
    const item: CartItem = {
      id: product.id,
      name: product.name,
      price: option.price,
      image: product.image,
      quantity: change.quantity,
      stock_quantity: option.stock,
      ...(option.size ? { size: option.size } : {}),
      ...(option.color ? { color: option.color } : {}),
    };
    if (target.requireAuthForIntent({ type: "cart", item })) target.addToCart(item);
    else ranHere = false;
  }

  return ranHere;
}
