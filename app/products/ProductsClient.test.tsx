// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { productRows, ratingRows, referenceRows } from "@/lib/catalog/__fixtures__/catalog-rows";
import { buildProductDoc, buildReference, buildSnapshot, computeRatingSummaries, toListCard } from "@/lib/catalog/build";
import { applyFilters, parseFilters } from "@/lib/catalog/filter";
import { featuredSlugs } from "@/lib/catalog/home";

// The app router syncs history.pushState/replaceState into useSearchParams. In jsdom we mirror that
// with an external store fed by a "locationchange" event dispatched from the patched history methods.
vi.mock("next/navigation", () => ({
  useSearchParams: () => {
    const search = useSyncExternalStore(
      (onChange) => {
        window.addEventListener("locationchange", onChange);
        return () => window.removeEventListener("locationchange", onChange);
      },
      () => window.location.search,
      () => "",
    );
    return new URLSearchParams(search);
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/products",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string | { toString(): string }; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/useCatalog", () => ({
  useCatalog: (initial: unknown) => ({ data: initial }),
  useRanking: () => ({ data: null }),
}));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => true }));
vi.mock("@/lib/analytics/meta-pixel", () => ({ trackSearch: vi.fn() }));
vi.mock("@/components/product-card", () => ({
  default: ({ product }: { product: { slug: string; name: string; is_featured?: boolean } }) => (
    <a href={`/products/${product.slug}`} data-testid="card" data-featured={String(Boolean(product.is_featured))}>
      {product.name}
    </a>
  ),
}));
vi.mock("@/components/FilterSheet", () => ({ default: () => null }));
vi.mock("@/components/SortSheet", () => ({ default: () => null }));

import ProductsClient from "./ProductsClient";

const reference = buildReference(referenceRows);
const ratings = computeRatingSummaries(ratingRows);
const cards = productRows.map((row) => toListCard(buildProductDoc(row, { reference, ratings })));
const snapshot = buildSnapshot(cards, reference, null, new Date("2026-09-13T00:00:00.000Z")).snapshot;
const total = snapshot.products.length;

const originalPushState = window.history.pushState;
const originalReplaceState = window.history.replaceState;

function itemsText(): string {
  return screen.getByText(/^\d+ items?$/).textContent ?? "";
}

function itemsLabel(count: number): string {
  return `${count} item${count === 1 ? "" : "s"}`;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/products");
  for (const method of ["pushState", "replaceState"] as const) {
    const original = method === "pushState" ? originalPushState : originalReplaceState;
    window.history[method] = function patched(this: History, ...args: Parameters<History["pushState"]>) {
      original.apply(this, args);
      window.dispatchEvent(new Event("locationchange"));
    };
  }
  class FakeIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  window.scrollTo = vi.fn();
});

afterEach(() => {
  window.history.pushState = originalPushState;
  window.history.replaceState = originalReplaceState;
  vi.unstubAllGlobals();
});

describe("ProductsClient", () => {
  it("renders every product from the snapshot with the total count", () => {
    render(<ProductsClient snapshot={snapshot} initialRanking={null} />);
    expect(itemsText()).toBe(itemsLabel(total));
    expect(screen.getAllByTestId("card")).toHaveLength(total);
    expect(window.location.search).toBe("");
  });

  it("filters by category instantly and writes the filter to the URL without navigating", () => {
    render(<ProductsClient snapshot={snapshot} initialRanking={null} />);
    const category = snapshot.reference.categories.find((c) => snapshot.products.some((p) => p.category_slug === c.slug));
    expect(category).toBeTruthy();
    const expected = snapshot.products.filter((p) => p.category_slug === category!.slug);
    expect(expected.length).toBeLessThan(total);

    fireEvent.click(screen.getByRole("button", { name: category!.name }));

    expect(window.location.search).toBe(`?category=${category!.slug}`);
    expect(itemsText()).toBe(itemsLabel(expected.length));
    expect(screen.getAllByTestId("card").map((a) => a.textContent)).toEqual(expected.map((p) => p.name));

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(window.location.search).toBe("");
    expect(itemsText()).toBe(itemsLabel(total));
  });

  it("filters locally while typing and syncs the search term to the URL after the debounce", async () => {
    render(<ProductsClient snapshot={snapshot} initialRanking={null} />);
    const term = "frock";
    const expected = applyFilters(snapshot.products, parseFilters(new URLSearchParams({ search: term })), null);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(total);

    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: term } });

    await waitFor(() => expect(window.location.search).toBe(`?search=${term}`), { timeout: 3000 });
    expect(itemsText()).toBe(itemsLabel(expected.length));
    expect(screen.getAllByTestId("card").map((a) => a.textContent)).toEqual(expected.map((p) => p.name));
  });

  it("renders the grid a deep link asked for", () => {
    const category = snapshot.reference.categories.find((c) => snapshot.products.some((p) => p.category_slug === c.slug))!;
    window.history.replaceState(null, "", `/products?category=${category.slug}`);
    render(<ProductsClient snapshot={snapshot} initialRanking={null} />);
    const expected = snapshot.products.filter((p) => p.category_slug === category.slug).length;
    expect(itemsText()).toBe(itemsLabel(expected));
  });

  // 2026-10-10: the category row ignored the Filters sheet, so Boys Coord Sets stayed tappable with Gender = Girl.
  it("greys out categories with no products under the applied filters, but never All or a chosen one", () => {
    window.history.replaceState(null, "", "/products?gender=girl");
    render(<ProductsClient snapshot={snapshot} initialRanking={null} />);
    expect(screen.getByRole("button", { name: "Boys Coord Sets" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Frocks" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "All" })).toBeEnabled();
  });

  it("moves greyed-out categories to the end of the row, keeping the usual order otherwise", () => {
    const row = () => screen.getByRole("button", { name: "All" }).parentElement!;
    const names = () => Array.from(row().querySelectorAll("button")).map((b) => b.textContent);
    render(<ProductsClient snapshot={snapshot} initialRanking={null} />);
    const usual = names();
    expect(usual.indexOf("Boys Coord Sets")).toBeLessThan(usual.length - 1);
    act(() => window.history.pushState(null, "", "/products?gender=girl"));
    expect(names()).toEqual([...usual.filter((n) => n !== "Boys Coord Sets"), "Boys Coord Sets"]);
  });

  it("keeps a chosen category tappable even when the other filters leave it empty", () => {
    window.history.replaceState(null, "", "/products?category=boys-coord-sets&gender=girl");
    render(<ProductsClient snapshot={snapshot} initialRanking={null} />);
    expect(screen.getByRole("button", { name: "Boys Coord Sets" })).toBeEnabled();
  });

  // 2026-10-10: the sheet's groups are multi-select, but the category row stays single-select.
  it("keeps the category row single-select: a tap replaces the chosen category", () => {
    render(<ProductsClient snapshot={snapshot} initialRanking={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Frocks" }));
    fireEvent.click(screen.getByRole("button", { name: "Jhabla" }));
    expect(window.location.search).toBe("?category=jhabla");
    expect(screen.getByRole("button", { name: "Frocks" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Jhabla" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(window.location.search).toBe("");
  });

  it("removes only the tapped value when one chip of a multi-choice filter is removed", () => {
    window.history.replaceState(null, "", "/products?colour=green,white");
    render(<ProductsClient snapshot={snapshot} initialRanking={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Colour filter Green" }));
    expect(window.location.search).toBe("?colour=white");
  });

  // Regression (2026-10-10): the grid badged products by the old is_featured flag, not the home Featured row.
  it("badges the same products as the home Featured row, not the database flag", () => {
    render(<ProductsClient snapshot={snapshot} initialRanking={null} />);
    const expected = featuredSlugs(snapshot.products);
    expect(expected.size).toBeGreaterThan(0);
    const badged = screen.getAllByTestId("card").filter((a) => a.dataset.featured === "true").map((a) => a.getAttribute("href"));
    expect(badged.sort()).toEqual([...expected].map((slug) => `/products/${slug}`).sort());
    // The fixture flags a product in the database that is not a baby-model best seller.
    expect(snapshot.products.some((p) => p.is_featured && !expected.has(p.slug))).toBe(true);
  });
});
