// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { productRows, ratingRows, referenceRows } from "@/lib/catalog/__fixtures__/catalog-rows";
import { buildProductDoc, buildReference, buildSnapshot, computeRatingSummaries, toListCard } from "@/lib/catalog/build";
import { applyFilters, parseFilters } from "@/lib/catalog/filter";

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
  default: ({ product }: { product: { slug: string; name: string } }) => (
    <a href={`/products/${product.slug}`} data-testid="card">
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
});
