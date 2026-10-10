// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Regression (2026-10-10): Loved by Parents fetched the first five products of the default order,
// which now leads with the same baby-model best sellers as Featured. The home page passes it a row
// that leaves out the Featured products; it must show that row and not fetch its own.

const useProducts = vi.fn((_params: { limit?: number; enabled?: boolean }) => ({
  data: { products: [{ id: "fetched", slug: "fetched", name: "Fetched" }] },
  isLoading: false,
  error: null,
}));
vi.mock("@/hooks/useApiQueries", () => ({ useProducts: (params: { limit?: number; enabled?: boolean }) => useProducts(params) }));
vi.mock("./product-card", () => ({
  default: ({ product }: { product: { slug: string; name: string } }) => <a href={`/products/${product.slug}`}>{product.name}</a>,
}));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import LovedByParents from "./loved-by-parents";
import type { Product } from "@/lib/services/api";

describe("LovedByParents", () => {
  it("shows the products the page hands it and does not fetch", () => {
    const initialProducts = [{ id: "a", slug: "a", name: "Best seller A" }] as unknown as Product[];
    render(<LovedByParents initialProducts={initialProducts} />);
    expect(screen.getByText("Best seller A")).toBeInTheDocument();
    expect(screen.queryByText("Fetched")).toBeNull();
    expect(useProducts).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("still fetches when the page has no catalog snapshot to hand it", () => {
    render(<LovedByParents />);
    expect(screen.getByText("Fetched")).toBeInTheDocument();
    expect(useProducts).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
  });
});
