import { CartItem } from "@/components/cart-context";
import { DELIVERY_CHARGE_INR, FREE_DELIVERY_THRESHOLD } from "@/lib/constants";

export function useCartTotals(cart: CartItem[]) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryCharge =
    cart.length > 0 && subtotal < FREE_DELIVERY_THRESHOLD ? DELIVERY_CHARGE_INR : 0;
  const grandTotal = subtotal + deliveryCharge;
  return { subtotal, deliveryCharge, grandTotal };
}
