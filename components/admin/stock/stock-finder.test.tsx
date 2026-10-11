// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { StockFinder } from "./index";
import { productRow, stockRow } from "@/lib/admin/__fixtures__/stock-metrics";
import type { FindFilters } from "@/lib/admin/stock-find";
import type { StockProductRow } from "@/lib/admin/stock-metrics";

function product(slug: string, name: string, gender: string | null, category: string, sizes: Array<[string, number, number]>, image: string | null = null): StockProductRow {
  return productRow({
    slug,
    name,
    gender_slug: gender,
    category_slug: category.toLowerCase().replace(/ /g, "-"),
    category_name: category,
    image,
    sizes: sizes.map(([size, stock, order]) =>
      stockRow({ variant_slug: `${slug}-${size}`, product_slug: slug, product_name: name, size_slug: size, size_label: size.toUpperCase(), size_order: order, stock }),
    ),
  });
}

const PRODUCTS = [
  product("daisy", "Blue Daisy", "girl", "Girls Coord Sets", [["1-2y", 4, 4], ["2-3y", 1, 5], ["3-4y", 0, 6]], "https://x.test/daisy_thumbnail.webp"),
  product("navy", "Navy", "boy", "Boys Coord Sets", [["2-3y", 2, 5]]),
  product("romper", "Romper", "unisex", "Rompers", [["2-3y", 3, 5]]),
];

function Harness({ initial = { gender: "any", size: null } as FindFilters }) {
  const [filters, setFilters] = useState<FindFilters>(initial);
  return <StockFinder products={PRODUCTS} filters={filters} onChange={setFilters} />;
}

const button = (name: RegExp) => screen.getByRole("button", { name });

describe("StockFinder", () => {
  it("lists categories collapsed with their counts, and drills down to sizes", () => {
    render(<Harness />);
    const region = screen.getByRole("region", { name: "Find stock" });
    expect(within(region).getAllByRole("button", { expanded: false }).map((b) => b.textContent)).toEqual([
      "Boys Coord Sets1 low▸",
      "Girls Coord Sets1 in · 1 last · 1 out▸",
      "Rompers1 in▸",
    ]);
    fireEvent.click(button(/^Girls Coord Sets/));
    fireEvent.click(button(/^Blue Daisy/));
    const sizes = within(screen.getByRole("list", { name: "Blue Daisy sizes" })).getAllByRole("listitem");
    expect(sizes.map((s) => s.textContent)).toEqual(["1-2YStall 1 · Home 3In stock", "2-3YStall 1 · Home 0Last piece", "3-4Y—Out"]);
    expect(sizes.map((s) => s.getAttribute("data-state"))).toEqual(["in", "last", "out"]);
    expect(within(sizes[1]).getByText("Last piece").tagName).toBe("STRONG");
  });

  it("shows the product photo, or a placeholder when there is none", () => {
    render(<Harness />);
    fireEvent.click(button(/^Girls Coord Sets/));
    fireEvent.click(button(/^Boys Coord Sets/));
    expect(button(/^Blue Daisy/).querySelector("img")?.getAttribute("src")).toBe("https://x.test/daisy_thumbnail.webp");
    expect(button(/^Navy/).querySelector("img")).toBeNull();
  });

  it("filters to girl and unisex products for Girl", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Girl" }));
    expect(screen.getByRole("radio", { name: "Girl" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("button", { name: /^Boys Coord Sets/ })).not.toBeInTheDocument();
    expect(button(/^Girls Coord Sets/)).toBeInTheDocument();
    expect(button(/^Rompers/)).toBeInTheDocument();
  });

  it("opens everything for a picked size, in stock first, and keeps a collapse until the size changes", () => {
    render(<Harness />);
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Any", "Girl", "Boy", "Any", "1-2Y", "2-3Y", "3-4Y"]);
    fireEvent.click(screen.getByRole("radio", { name: "2-3Y" }));
    // Category order (Boys, Girls, Rompers); within a category, in stock first.
    const productNames = within(screen.getByRole("region", { name: "Find stock" }))
      .getAllByRole("list", { name: /sizes$/ })
      .map((l) => l.getAttribute("aria-label"));
    expect(productNames).toEqual(["Navy sizes", "Blue Daisy sizes", "Romper sizes"]);
    expect(within(screen.getByRole("list", { name: "Blue Daisy sizes" })).getByRole("listitem")).toHaveTextContent("2-3YStall 1 · Home 0Last piece");
    expect(within(screen.getByRole("list", { name: "Navy sizes" })).getByRole("listitem")).toHaveTextContent("2-3YStall 1 · Home 1Low");
    expect(within(screen.getByRole("list", { name: "Romper sizes" })).getByRole("listitem")).toHaveTextContent("2-3YStall 1 · Home 2In stock");

    // A collapse survives a gender change…
    fireEvent.click(button(/^Romper(?!s)/));
    expect(screen.queryByRole("list", { name: "Romper sizes" })).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Gender" })).getByRole("radio", { name: "Girl" }));
    expect(screen.queryByRole("list", { name: "Romper sizes" })).not.toBeInTheDocument();
    // …and a size change (even back to the same size) opens everything again.
    fireEvent.click(screen.getByRole("radio", { name: "1-2Y" }));
    fireEvent.click(screen.getByRole("radio", { name: "2-3Y" }));
    expect(screen.getByRole("list", { name: "Romper sizes" })).toBeInTheDocument();
  });

  it("treats an unknown size from the URL as Any", () => {
    render(<Harness initial={{ gender: "any", size: "9-10y" }} />);
    const sizeChips = within(screen.getByRole("radiogroup", { name: "Size" }));
    expect(sizeChips.getByRole("radio", { name: "Any" })).toHaveAttribute("aria-checked", "true");
    expect(button(/^Girls Coord Sets/)).toHaveAttribute("aria-expanded", "false");
  });

  it("names the filters when nothing matches", () => {
    render(<Harness initial={{ gender: "boy", size: "3-4y" }} />);
    expect(screen.getByText("Nothing in 3-4Y for Boy")).toBeInTheDocument();
  });

  it("drops an unknown size from the filters when a gender is tapped", () => {
    const onChange = vi.fn();
    render(<StockFinder products={PRODUCTS} filters={{ gender: "any", size: "9-10y" }} onChange={onChange} />);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Gender" })).getByRole("radio", { name: "Girl" }));
    expect(onChange).toHaveBeenCalledWith({ gender: "girl", size: null });
  });
});
