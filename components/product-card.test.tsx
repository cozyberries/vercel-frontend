// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/services/api";

// Regression (2026-09-14): a product with zero stock everywhere looked buyable in the grid; tapping
// Add only produced an "out of stock" toast. Sold-out products must say so and disable Add.

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
vi.mock("./cart-context", () => ({
  useCart: () => ({ addToCart: vi.fn(), updateQuantity: vi.fn(), removeFromCart: vi.fn(), cart: [] }),
  getCartItemKey: (item: { id: string; size?: string; color?: string }) => `${item.id}|${item.size ?? ""}|${item.color ?? ""}`,
}));
vi.mock("./auth-gate-context", () => ({ useAuthGate: () => ({ requireAuthForIntent: () => true }) }));
vi.mock("./QuickAddDialog", () => ({ default: () => null }));
vi.mock("@/components/discounted-price", () => ({ default: ({ price }: { price: number }) => <span>₹{price}</span> }));

import ProductCard from "./product-card";

function product(overrides: Partial<Product>): Product {
  return {
    id: "new-born-essential-kits-popsicles",
    slug: "new-born-essential-kits-popsicles",
    name: "Popsicles - New Born Essential Kit",
    description: "",
    price: 1499,
    care_instructions: "",
    stock_quantity: 0,
    is_featured: false,
    category_slug: "newborn-essentials",
    category: "Newborn Essentials",
    categories: { name: "Newborn Essentials", slug: "newborn-essentials" },
    features: [],
    images: ["https://img/kit.jpg"],
    colors: ["popsicles"],
    sizes: [],
    variants: [],
    ...overrides,
  };
}

describe("ProductCard sold-out state", () => {
  it("shows a Sold out badge and disables Add when no size has stock", () => {
    render(
      <ProductCard
        index={0}
        currentView="grid"
        product={product({ sizes: [{ name: "0-3M", price: 1499, stock_quantity: 0, display_order: 1 }] })}
      />,
    );
    expect(screen.getByText("Sold out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sold out" })).toBeDisabled();
  });

  it("shows a Sold out badge for a product without sizes whose own stock is zero", () => {
    render(<ProductCard index={0} currentView="grid" product={product({ stock_quantity: 0 })} />);
    expect(screen.getByText("Sold out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sold out" })).toBeDisabled();
  });

  it("keeps Add enabled and shows no badge while any size is in stock", () => {
    render(
      <ProductCard
        index={0}
        currentView="grid"
        product={product({
          sizes: [
            { name: "0-3M", price: 1499, stock_quantity: 0, display_order: 1 },
            { name: "3-6M", price: 1499, stock_quantity: 2, display_order: 2 },
          ],
        })}
      />,
    );
    expect(screen.queryByText("Sold out")).toBeNull();
    expect(screen.getByRole("button", { name: "Add to cart" })).toBeEnabled();
  });
});
