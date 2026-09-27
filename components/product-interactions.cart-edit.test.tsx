// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItem } from "./cart-context";
import type { Product } from "@/lib/services/api";

// Editing the cart from the product page (2026-09-27): once the selected size was in the cart the
// sticky button only offered "Go to Cart", so the count could not be raised, lowered or removed here.
// Regression in the same change: a size added from a product card (no colour on the line) was not
// recognised here, because this page looked the line up with colour = product.colors[0].

const store = vi.hoisted(() => ({ seed: [] as CartItem[], push: vi.fn(), toastSuccess: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: store.push }) }));
vi.mock("@/components/ui/supabase-image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("./auth-gate-context", () => ({ useAuthGate: () => ({ requireAuthForIntent: () => true }) }));
vi.mock("sonner", () => ({ toast: { success: store.toastSuccess, error: vi.fn(), warning: vi.fn() } }));
vi.mock("./rating-context", () => ({
  useRating: () => ({ reviews: [], showViewReviewModal: false, fetchReviews: vi.fn(), setProductSlug: vi.fn() }),
}));
vi.mock("@/hooks/useApiQueries", () => ({ useFeaturedProducts: () => ({ data: [] }) }));
vi.mock("@/components/discounted-price", () => ({ default: ({ price }: { price: number }) => <span>₹{price}</span> }));
vi.mock("./reviews", () => ({ default: () => null }));
vi.mock("./view_review", () => ({ default: () => null }));
vi.mock("./rating/WriteReviewDialog", () => ({ default: () => null }));
vi.mock("./SizeGuideDialog", () => ({ default: () => null }));
vi.mock("./PincodeChecker", () => ({ default: () => null }));
vi.mock("./product-card", () => ({ default: () => null }));
vi.mock("@/lib/utils/notify", () => ({ sendNotification: vi.fn() }));
vi.mock("@/lib/utils/activities", () => ({ sendActivity: vi.fn() }));
vi.mock("@/lib/analytics/meta-pixel", () => ({ trackViewContent: vi.fn() }));
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
import ProductInteractions from "./product-interactions";
import { CartLines, cartLines } from "./testing/cart-lines";

const NAME = "Long Sleeve Pyjamas - Without Rib";

function pyjamas(overrides: Partial<Product> = {}): Product {
  return {
    id: "pyjamas-without-rib",
    slug: "pyjamas-without-rib",
    name: NAME,
    description: "",
    price: 734,
    care_instructions: "",
    stock_quantity: 8,
    is_featured: false,
    category_slug: "pyjamas",
    category: "Pyjamas",
    categories: { name: "Pyjamas", slug: "pyjamas" },
    features: [],
    images: ["https://img/pyjamas.jpg"],
    colors: ["mushie-mini"],
    sizes: [
      { name: "1-2Y", price: 734, stock_quantity: 4, display_order: 1 },
      { name: "2-3Y", price: 734, stock_quantity: 4, display_order: 2 },
    ],
    variants: [],
    ...overrides,
  };
}

const line = (overrides: Partial<CartItem>): CartItem => ({
  id: "pyjamas-without-rib",
  name: NAME,
  price: 734,
  quantity: 1,
  stock_quantity: 4,
  ...overrides,
});

const page = (product: Product) => (
  <CartProvider>
    <ProductInteractions product={product} staticContent={null} relatedProducts={[]} />
    <CartLines />
  </CartProvider>
);

function renderPage(seed: CartItem[] = []) {
  store.seed = seed;
  return render(page(pyjamas()));
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const quantity = () => screen.getByRole("status", { name: "Quantity" });
const goToCart = () => screen.getByRole("button", { name: /Added.*Go to Cart/i });

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

describe("ProductInteractions with the selected size in the cart", () => {
  it("recognises a size added from a product card and starts the quantity at its count", () => {
    renderPage([line({ size: "1-2Y" })]);
    expect(goToCart()).toBeInTheDocument();
    expect(quantity()).toHaveTextContent("1");
    expect(screen.getByText("Already in your cart")).toBeInTheDocument();
  });

  it("tells screen readers the count on a size chip without changing its name", () => {
    renderPage([line({ size: "1-2Y" })]);
    expect(screen.getByRole("button", { name: "1-2Y" })).toHaveAccessibleDescription("1 in cart");
  });

  it("offers Update cart once the count differs, then goes back to Go to Cart at the new count", () => {
    renderPage([line({ size: "1-2Y" })]);
    click("Increase quantity");
    click("Update cart");
    expect(cartLines()).toEqual(["1-2Y - 2"]);
    expect(goToCart()).toBeInTheDocument();
    expect(quantity()).toHaveTextContent("2");
    expect(store.toastSuccess).toHaveBeenCalledWith(`${NAME} updated in cart`);
  });

  it("lets the count go to 0, removes the size, then offers to add it again from 1", () => {
    renderPage([line({ size: "1-2Y" })]);
    click("Decrease quantity");
    expect(quantity()).toHaveTextContent("0");
    expect(screen.getByText("Will be removed from your cart")).toBeInTheDocument();
    click("Remove from cart");
    expect(cartLines()).toEqual([]);
    expect(quantity()).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "Add to cart" })).toBeInTheDocument();
  });

  it("loads the count of a size in the cart when that size is picked", () => {
    renderPage([line({ size: "2-3Y", quantity: 3 })]);
    expect(quantity()).toHaveTextContent("1");
    click("2-3Y");
    expect(quantity()).toHaveTextContent("3");
    expect(goToCart()).toBeInTheDocument();
  });

  it("does not carry an unsaved count over to another product", () => {
    store.seed = [line({ size: "1-2Y" }), line({ id: "pyjamas-with-rib", size: "1-2Y" })];
    const { rerender } = render(page(pyjamas()));
    click("Increase quantity");
    rerender(page(pyjamas({ id: "pyjamas-with-rib", slug: "pyjamas-with-rib" })));
    expect(quantity()).toHaveTextContent("1");
    expect(goToCart()).toBeInTheDocument();
  });
});

describe("ProductInteractions with the selected size not in the cart", () => {
  it("still adds from 1, with the old floor of 1", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
    click("Add to cart");
    expect(cartLines()).toEqual(["1-2Y mushie-mini 1"]);
  });

  it("Frequently bought together raises the line the sticky button added, instead of starting a second one", () => {
    // Regression: the bundle adds the current product without a colour, the sticky button with
    // product.colors[0], so the same size used to land on two lines.
    store.seed = [];
    const romper = pyjamas({
      id: "romper",
      slug: "romper",
      name: "Romper",
      sizes: [{ name: "0-3M", price: 599, stock_quantity: 2, display_order: 1 }],
    });
    render(
      <CartProvider>
        <ProductInteractions product={pyjamas()} staticContent={null} relatedProducts={[romper]} />
        <CartLines />
      </CartProvider>,
    );
    click("Add to cart");
    click("Add 2 to cart");
    expect(cartLines()).toEqual(["1-2Y mushie-mini 2", "0-3M - 1"]);
  });

  it("keeps the chosen quantity when switching between sizes that are not in the cart", () => {
    renderPage();
    click("Increase quantity");
    click("2-3Y");
    expect(quantity()).toHaveTextContent("2");
    click("Add to cart");
    expect(cartLines()).toEqual(["2-3Y mushie-mini 2"]);
  });
});
