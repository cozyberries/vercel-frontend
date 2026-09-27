// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItem } from "./cart-context";
import type { Product } from "@/lib/services/api";

// Editing the cart from the products page (2026-09-27): a card's ✓ only ever added more. It now
// opens the picker on what is in the cart, where a size can be lowered, removed or swapped.
// Regression in the same change: the product page saves colour = product.colors[0] on the line and
// the card saves none, so the card did not see sizes added on the product page at all.

const store = vi.hoisted(() => ({ seed: [] as CartItem[], toastSuccess: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/ui/supabase-image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("./wishlist-context", () => ({
  useWishlist: () => ({ addToWishlist: vi.fn(), removeFromWishlist: vi.fn(), isInWishlist: () => false }),
}));
vi.mock("./auth-gate-context", () => ({ useAuthGate: () => ({ requireAuthForIntent: () => true }) }));
vi.mock("@/components/discounted-price", () => ({ default: ({ price }: { price: number }) => <span>₹{price}</span> }));
vi.mock("sonner", () => ({ toast: { success: store.toastSuccess, error: vi.fn(), warning: vi.fn() } }));
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

import { CartProvider } from "./cart-context";
import ProductCard from "./product-card";
import { CartLines, cartLines } from "./testing/cart-lines";

const NAME = "Long Sleeve Pyjamas - Without Rib";

function product(overrides: Partial<Product>): Product {
  return {
    id: "pyjamas-without-rib",
    slug: "pyjamas-without-rib",
    name: NAME,
    description: "",
    price: 734,
    care_instructions: "",
    stock_quantity: 3,
    is_featured: false,
    category_slug: "pyjamas",
    category: "Pyjamas",
    categories: { name: "Pyjamas", slug: "pyjamas" },
    features: [],
    images: ["https://img/pyjamas.jpg"],
    colors: ["mushie-mini"],
    sizes: [],
    variants: [],
    ...overrides,
  };
}

const sized = (stock: number) =>
  product({
    sizes: [
      { name: "1-2Y", price: 734, stock_quantity: stock, display_order: 1 },
      { name: "2-3Y", price: 734, stock_quantity: stock, display_order: 2 },
    ],
  });

const line = (overrides: Partial<CartItem>): CartItem => ({
  id: "pyjamas-without-rib",
  name: NAME,
  price: 734,
  quantity: 1,
  stock_quantity: 4,
  ...overrides,
});

function renderCard(p: Product, seed: CartItem[] = []) {
  store.seed = seed;
  render(
    <CartProvider>
      <ProductCard index={0} currentView="list" product={p} />
      <CartLines />
    </CartProvider>,
  );
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProductCard with the product in the cart", () => {
  it("opens the picker on the size in the cart, including one added on the product page", () => {
    renderCard(sized(4), [line({ size: "1-2Y", color: "mushie-mini" })]);
    click("In cart: 1 — edit");
    expect(screen.getByRole("dialog", { name: "Edit cart" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1-2Y" })).toHaveAttribute("aria-pressed", "true");
  });

  it("removes the line when its count is taken to 0, and the card goes back to Add", () => {
    renderCard(sized(4), [line({ size: "1-2Y", color: "mushie-mini" })]);
    click("In cart: 1 — edit");
    click("Decrease quantity");
    click("Remove from cart");
    expect(cartLines()).toEqual([]);
    expect(screen.getByRole("button", { name: "Add to cart" })).toBeInTheDocument();
    expect(store.toastSuccess).toHaveBeenCalledWith(`${NAME} removed from cart`);
  });

  it("swaps one size for another in a single save", () => {
    renderCard(sized(4), [line({ size: "1-2Y" })]);
    click("In cart: 1 — edit");
    click("Decrease quantity");
    click("2-3Y");
    click(/^Update cart/);
    expect(cartLines()).toEqual(["2-3Y - 1"]);
    expect(store.toastSuccess).toHaveBeenCalledWith(`${NAME} updated in cart`);
  });

  it("sets a new count and folds duplicate lines of one size into a single line", () => {
    renderCard(sized(4), [line({ size: "1-2Y", color: "mushie-mini" }), line({ size: "1-2Y", quantity: 2 })]);
    click("In cart: 3 — edit");
    expect(screen.getByRole("status", { name: "Quantity" })).toHaveTextContent("3");
    click("Decrease quantity");
    click(/^Update cart/);
    expect(cartLines()).toEqual(["1-2Y mushie-mini 2"]);
    expect(screen.getByRole("button", { name: "In cart: 2 — edit" })).toBeInTheDocument();
  });

  it("opens the picker for a product without sizes instead of adding another", () => {
    renderCard(product({}), [line({})]);
    click("In cart: 1 — edit");
    expect(screen.getByRole("dialog", { name: "Edit cart" })).toBeInTheDocument();
    expect(cartLines()).toEqual(["- - 1"]);
  });

  it("can still remove a size that sold out after it was added", () => {
    renderCard(sized(0), [line({ size: "1-2Y" })]);
    click("In cart: 1 — edit");
    expect(screen.getByRole("button", { name: "1-2Y" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    click("Decrease quantity");
    click("Remove from cart");
    expect(cartLines()).toEqual([]);
    expect(screen.getByRole("button", { name: "Sold out" })).toBeDisabled();
  });
});

describe("ProductCard with the product not in the cart", () => {
  it("still adds a product without sizes straight away", () => {
    renderCard(product({}));
    click("Add to cart");
    expect(cartLines()).toEqual(["- - 1"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
