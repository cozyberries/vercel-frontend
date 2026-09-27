import { screen, within } from "@testing-library/react";
import { getCartItemKey, useCart } from "@/components/cart-context";

/**
 * Test-only: renders the real cart's lines as "size colour quantity" ("-" when a line has no size
 * or colour), so a test can assert what a click actually left in the cart.
 */
export function CartLines() {
  const { cart } = useCart();
  return (
    <ul aria-label="Cart lines">
      {cart.map((item) => (
        <li key={getCartItemKey(item)}>{[item.size ?? "-", item.color ?? "-", item.quantity].join(" ")}</li>
      ))}
    </ul>
  );
}

/** Reads the lines, also while a modal dialog hides the rest of the page from the accessibility tree. */
export function cartLines(): (string | null)[] {
  return within(screen.getByRole("list", { name: "Cart lines", hidden: true }))
    .queryAllByRole("listitem", { hidden: true })
    .map((li) => li.textContent);
}
