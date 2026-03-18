import { CartItem } from "@/components/cart-context";
import { DELIVERY_CHARGE_INR, FREE_DELIVERY_THRESHOLD } from "@/lib/constants";

/** Offer shape used for discount calculation (from getActiveOffer or useActiveOffer().data) */
export interface CartOffer {
  code: string;
  discountRate: number;
  badgeText: string;
}

export function useCartTotals(cart: CartItem[], offer?: CartOffer | null) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountAmount =
    offer && cart.length > 0 ? Math.floor(subtotal * offer.discountRate) : 0;
  const discountedSubtotal = subtotal - discountAmount;
  const deliveryCharge =
    cart.length > 0 && discountedSubtotal < FREE_DELIVERY_THRESHOLD
      ? DELIVERY_CHARGE_INR
      : 0;
  const grandTotal = discountedSubtotal + deliveryCharge;
  return {
    subtotal,
    discountAmount,
    discountedSubtotal,
    deliveryCharge,
    grandTotal,
    offer: offer ?? null,
  };
}
