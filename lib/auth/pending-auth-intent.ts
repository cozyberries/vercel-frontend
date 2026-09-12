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

export type PendingAuthIntent =
  | { type: "wishlist"; item: PendingWishlistPayload }
  | { type: "cart"; item: PendingCartPayload }
  | { type: "buy_now"; item: PendingCartPayload };
