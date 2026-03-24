/** Serializable wishlist line (matches WishlistItem shape). */
export type PendingWishlistPayload = {
  id: string;
  name: string;
  price: number;
  image?: string;
  size?: string;
  color?: string;
};

/** Serializable cart line (matches CartItem shape). */
export type PendingCartPayload = {
  id: string;
  name: string;
  price: number;
  image?: string;
  quantity: number;
  size?: string;
  color?: string;
  stock_quantity?: number;
};

export const PENDING_AUTH_INTENT_STORAGE_KEY = "cozyburry_pending_auth_intent_v1";

export type PendingAuthIntent =
  | { type: "wishlist"; item: PendingWishlistPayload }
  | { type: "cart"; item: PendingCartPayload }
  | { type: "buy_now"; item: PendingCartPayload };

export function isSafeRedirectPath(path: string): boolean {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\"))
    return false;
  const pathWithoutQuery = path.split("?")[0];
  if (pathWithoutQuery.includes(":")) return false;
  return true;
}

export function persistPendingIntentForRedirect(intent: PendingAuthIntent): void {
  try {
    sessionStorage.setItem(
      PENDING_AUTH_INTENT_STORAGE_KEY,
      JSON.stringify(intent),
    );
  } catch {
    // sessionStorage may be unavailable
  }
}

export function parsePendingIntent(raw: string): PendingAuthIntent | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as { type?: string; item?: { id?: string } };
    if (
      (p.type === "wishlist" || p.type === "cart" || p.type === "buy_now") &&
      p.item &&
      typeof p.item.id === "string"
    ) {
      return p as PendingAuthIntent;
    }
  } catch {
    // ignore
  }
  return null;
}
