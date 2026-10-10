// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItem } from "./cart-context";
import type { Product } from "@/lib/services/api";
import type { OrderItem } from "@/lib/types/order";

// Regression (2026-09-27): cart lines were keyed id|size|colour, and the pages disagree on colour —
// the product page saves product.colors[0], cards and the bundle save none, the wishlist saves "",
// a reorder saves the order's colour name. The same size then sat on two lines. Lines are now keyed
// on product + size, and a saved cart that already holds such duplicates is folded on load.

const store = vi.hoisted(() => ({
  seed: [] as CartItem[],
  wishlist: [] as { id: string; name: string; price: number; size?: string; color?: string }[],
  product: null as unknown,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/auth-gate-context", () => ({ useAuthGate: () => ({ requireAuthForIntent: () => true }) }));
vi.mock("@/components/wishlist-context", () => ({
  useWishlist: () => ({ wishlist: store.wishlist, removeFromWishlist: vi.fn(), clearWishlist: vi.fn(), isLoading: false }),
}));
vi.mock("@/components/wishlist-warning-dialog", () => ({ default: () => null }));
vi.mock("@/components/discounted-price", () => ({ default: ({ price }: { price: number }) => <span>₹{price}</span> }));
vi.mock("@/lib/services/api", () => ({ getProductById: async () => store.product }));
// The real CartProvider runs; only its storage edges are stubbed: no session, a seeded device cart.
vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => ({ user: null, loading: false, impersonation: { active: false, target: null }, impersonationReady: true }),
}));
vi.mock("@/lib/services/cart", () => ({
  cartService: {
    getLocalCart: () => store.seed.map((item) => ({ ...item })),
    saveLocalCart: () => {},
    clearLocalCart: () => {},
    getUserCart: async () => [],
    saveUserCart: async () => {},
    clearUserCart: async () => {},
    mergeCartItems: (local: CartItem[]) => local,
  },
}));
vi.mock("@/lib/services/event-logger", () => ({ logEvent: () => {} }));

import { CartProvider, collapseCartLines, useCart } from "./cart-context";
import CartItemRow from "./CartItem";
import WishlistPage from "@/app/wishlist/page";
import { useReorder } from "@/hooks/useReorder";
import { CartLines, cartLines } from "./testing/cart-lines";

const NAME = "Long Sleeve Pyjamas - Without Rib";

const line = (overrides: Partial<CartItem>): CartItem => ({
  id: "pyjamas-without-rib",
  name: NAME,
  price: 734,
  quantity: 1,
  stock_quantity: 4,
  ...overrides,
});

const pyjamas = {
  id: "pyjamas-without-rib",
  name: NAME,
  price: 734,
  stock_quantity: 8,
  images: [],
  variants: [],
  sizes: [
    { name: "1-2Y", price: 734, stock_quantity: 4, display_order: 1 },
    { name: "2-3Y", price: 734, stock_quantity: 4, display_order: 2 },
  ],
} as unknown as Product;

function withCart(seed: CartItem[]) {
  store.seed = seed;
  return renderHook(() => useCart(), { wrapper: CartProvider });
}

const shape = (cart: CartItem[]) => cart.map((i) => [i.size ?? "-", i.color ?? "-", i.quantity].join(" "));

beforeEach(() => {
  store.wishlist = [];
  store.product = pyjamas;
});

describe("CartProvider", () => {
  it("adds to the existing line when the same size arrives with another colour", () => {
    const { result } = withCart([line({ size: "1-2Y", color: "mushie-mini" })]);
    act(() => result.current.addToCart(line({ size: "1-2Y" })));
    expect(shape(result.current.cart)).toEqual(["1-2Y mushie-mini 2"]);
  });

  it("folds a saved cart's two lines for one size into the first line", () => {
    const { result } = withCart([line({ size: "1-2Y", color: "mushie-mini" }), line({ size: "1-2Y", quantity: 2 })]);
    expect(shape(result.current.cart)).toEqual(["1-2Y mushie-mini 3"]);
  });

  it("caps a folded line at its stock", () => {
    const { result } = withCart([line({ size: "1-2Y", quantity: 3 }), line({ size: "1-2Y", color: "mushie-mini", quantity: 3 })]);
    expect(shape(result.current.cart)).toEqual(["1-2Y - 4"]);
  });

  it("updates and removes a size whatever colour its line was saved with", () => {
    const { result } = withCart([line({ size: "1-2Y", color: "mushie-mini", quantity: 2 })]);
    act(() => result.current.updateQuantity("pyjamas-without-rib", 1, "1-2Y"));
    expect(shape(result.current.cart)).toEqual(["1-2Y mushie-mini 1"]);
    act(() => result.current.removeFromCart("pyjamas-without-rib", "1-2Y"));
    expect(result.current.cart).toEqual([]);
  });
});

describe("paths that add a size already in the cart", () => {
  it("wishlist → Add to cart raises the existing line", () => {
    store.seed = [line({ size: "1-2Y", color: "mushie-mini" })];
    store.wishlist = [{ id: "pyjamas-without-rib", name: NAME, price: 734, size: "1-2Y", color: "" }];
    render(
      <CartProvider>
        <WishlistPage />
        <CartLines />
      </CartProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(cartLines()).toEqual(["1-2Y mushie-mini 2"]);
  });

  it("reorder raises the existing line", async () => {
    store.seed = [line({ size: "1-2Y" })];
    const { result } = renderHook(() => ({ reorder: useReorder(), cart: useCart().cart }), { wrapper: CartProvider });
    const ordered: OrderItem = { id: "pyjamas-without-rib", name: NAME, price: 734, quantity: 1, size: "1-2Y", color: "Mushie Mini" };
    await act(() => result.current.reorder([ordered]));
    expect(shape(result.current.cart)).toEqual(["1-2Y - 2"]);
  });

  it("changing a line's size on /cart joins the line already in that size", async () => {
    store.seed = [line({ size: "1-2Y" }), line({ size: "2-3Y", color: "mushie-mini" })];
    function FirstRow() {
      const { cart, updateQuantity, removeFromCart } = useCart();
      const item = cart.find((i) => i.size === "1-2Y");
      return item ? <CartItemRow item={item} onQuantityChange={updateQuantity} onRemove={removeFromCart} /> : null;
    }
    render(
      <CartProvider>
        <FirstRow />
        <CartLines />
      </CartProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Size 1-2Y" }));
    fireEvent.click(await screen.findByRole("button", { name: "2-3Y" }));
    fireEvent.click(screen.getByRole("button", { name: /^Update · ₹/ }));
    expect(cartLines()).toEqual(["2-3Y mushie-mini 2"]);
  });
});

describe("collapseCartLines with renamed slugs", () => {
  // 2026-10-10: carts saved in a browser before the slug fix must still check out.
  it("re-keys old product slugs and the old print, then merges lines that now match", () => {
    const line = (id: string, size: string, quantity: number, color?: string) =>
      ({ id, name: id, price: 699, size, quantity, ...(color ? { color } : {}) }) as CartItem;
    const out = collapseCartLines([
      line("pyjamas-classic-popsicles", "0-3M", 1),
      line("pyjamas-with-rib-popsicles", "0-3M", 2),
      line("pyjamas-classic-popsicles", "3-6M", 1),
      line("coords-set-boys-naughty-nuts", "1-2Y", 1, "naugthy-nuts"),
    ]);
    expect(out.map((l) => [l.id, l.size, l.quantity, l.color])).toEqual([
      ["pyjamas-with-rib-popsicles", "0-3M", 3, undefined],
      ["pyjamas-with-rib-popsicles", "3-6M", 1, undefined],
      ["coords-set-boys-naughty-nuts", "1-2Y", 1, "naughty-nuts"],
    ]);
  });
});
