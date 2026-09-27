import { toast } from "sonner";
import { useCart } from "@/components/cart-context";
import { useAuthGate } from "@/components/auth-gate-context";
import {
  applyCartChanges,
  cartCountsFor,
  cartEditMessage,
  type CartChange,
  type CartEditOutcome,
  type SizeCounts,
  type SizeOption,
} from "@/lib/utils/cart-edit";

/**
 * One product's lines in the cart, and a way to change them from outside /cart
 * (product cards, the product page). See `lib/utils/cart-edit.ts`.
 */
export function useProductCartEdit(
  product: { id: string; name: string; image?: string },
  options: SizeOption[],
): {
  cartCounts: SizeCounts;
  saveCartChanges: (changes: CartChange[], outcome: Exclude<CartEditOutcome, "none">) => void;
} {
  const { cart, addToCart, updateQuantity, removeFromCart } = useCart();
  const { requireAuthForIntent } = useAuthGate();

  const saveCartChanges = (changes: CartChange[], outcome: Exclude<CartEditOutcome, "none">) => {
    const ranHere = applyCartChanges(changes, {
      product,
      options,
      cart,
      addToCart,
      updateQuantity,
      removeFromCart,
      requireAuthForIntent,
    });
    if (ranHere) toast.success(cartEditMessage(product.name, outcome));
  };

  return { cartCounts: cartCountsFor(cart, product.id), saveCartChanges };
}
