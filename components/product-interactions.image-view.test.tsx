// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/services/api";

// Product page photos on touch screens (2026-10-11): touch or mouse was decided by width
// (innerWidth < 768). A phone turned sideways or a tablet is 768+ wide, so a tap fired the
// desktop hover zoom: a 35rem panel beside the photo that ran off the screen and never closed
// (touch sends no mouseleave), and the full-screen viewer was hidden by md:hidden.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/components/ui/supabase-image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("./auth-gate-context", () => ({ useAuthGate: () => ({ requireAuthForIntent: () => true }) }));
vi.mock("./cart-context", () => ({ useCart: () => ({ addToCart: vi.fn(), cart: [] }) }));
vi.mock("@/hooks/useProductCartEdit", () => ({
  useProductCartEdit: () => ({ cartCounts: {}, saveCartChanges: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("./rating-context", () => ({
  useRating: () => ({ reviews: [], showViewReviewModal: false, fetchReviews: vi.fn(), setProductSlug: vi.fn() }),
}));
vi.mock("@/hooks/useApiQueries", () => ({ useFeaturedProducts: () => ({ data: [] }) }));
vi.mock("@/components/discounted-price", () => ({ default: ({ price }: { price: number }) => <span>₹{price}</span> }));
vi.mock("./reviews", () => ({ default: () => null }));
vi.mock("./view_review", () => ({ default: () => null }));
vi.mock("./rating/WriteReviewDialog", () => ({ default: () => null }));
vi.mock("./SizeGuideDialog", () => ({ default: () => null }));
vi.mock("./QuickAddDialog", () => ({ default: () => null }));
vi.mock("./PincodeChecker", () => ({ default: () => null }));
vi.mock("./product-card", () => ({ default: () => null }));
vi.mock("@/lib/utils/notify", () => ({ sendNotification: vi.fn() }));
vi.mock("@/lib/utils/activities", () => ({ sendActivity: vi.fn() }));
vi.mock("@/lib/analytics/meta-pixel", () => ({ trackViewContent: vi.fn() }));
vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => ({ user: null, loading: false, impersonation: { active: false, target: null }, impersonationReady: true }),
}));

import ProductInteractions from "./product-interactions";

const NAME = "Soft Pear - Boys Co ord set";

const product: Product = {
  id: "coords-set-boys-soft-pear",
  slug: "coords-set-boys-soft-pear",
  name: NAME,
  description: "",
  price: 923,
  care_instructions: "",
  stock_quantity: 8,
  is_featured: false,
  category_slug: "boys-coord-sets",
  category: "Boys Coord Sets",
  categories: { name: "Boys Coord Sets", slug: "boys-coord-sets" },
  features: [],
  images: ["https://img/1.jpg", "https://img/2.jpg"],
  colors: [],
  sizes: [{ name: "1-2Y", price: 923, stock_quantity: 4, display_order: 1 }],
  variants: [],
};

/** A device that has a mouse (fine pointer that can hover) or only touch. */
function device({ mouse, width }: { mouse: boolean; width: number }) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.matchMedia = vi.fn((query: string) => ({
    matches: mouse && query.includes("hover: hover") && width >= 768,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const mainPhoto = () => screen.getAllByAltText(NAME)[0];
const viewer = () => screen.queryByRole("dialog", { name: "Photo viewer" });

const originalMatchMedia = window.matchMedia;
beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("ProductInteractions photo on a touch screen", () => {
  it.each([
    ["a portrait phone", 375],
    ["a phone turned sideways", 844],
    ["a tablet", 1024],
  ])("on %s a tap opens the full-screen viewer, never the hover zoom", (_label, width) => {
    device({ mouse: false, width });
    render(<ProductInteractions product={product} staticContent={null} relatedProducts={[]} />);

    fireEvent.mouseEnter(mainPhoto());
    fireEvent.click(mainPhoto());

    expect(screen.queryByText("2.5x Zoom")).not.toBeInTheDocument();
    expect(viewer()).toBeInTheDocument();
  });

  it("the viewer is not hidden at md and up", () => {
    device({ mouse: false, width: 844 });
    render(<ProductInteractions product={product} staticContent={null} relatedProducts={[]} />);
    fireEvent.click(mainPhoto());
    expect(viewer()!.className).not.toMatch(/\bmd:hidden\b/);
  });

  it("closes from the close button", () => {
    device({ mouse: false, width: 375 });
    render(<ProductInteractions product={product} staticContent={null} relatedProducts={[]} />);
    fireEvent.click(mainPhoto());
    fireEvent.click(screen.getByRole("button", { name: "Close photo viewer" }));
    expect(viewer()).not.toBeInTheDocument();
  });
});

describe("ProductInteractions photo with a mouse", () => {
  it("hovering shows the zoom and a click does not open the viewer", () => {
    device({ mouse: true, width: 1280 });
    render(<ProductInteractions product={product} staticContent={null} relatedProducts={[]} />);

    fireEvent.mouseEnter(mainPhoto());
    expect(screen.getByText("2.5x Zoom")).toBeInTheDocument();

    fireEvent.click(mainPhoto());
    expect(viewer()).not.toBeInTheDocument();
  });
});
