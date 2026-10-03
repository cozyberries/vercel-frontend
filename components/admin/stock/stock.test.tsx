// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SizeGapGrid, StockList } from "./index";
import { stockMetricsFixture, stockRow } from "@/lib/admin/__fixtures__/stock-metrics";

const NOW = new Date("2026-10-03T04:30:00Z");
const metrics = stockMetricsFixture();

describe("StockList", () => {
  it("shows the first 10 rows with their stock and sales, and expands to all", () => {
    render(<StockList title="Restock next" rows={metrics.restock} now={NOW} emptyTitle="none" />);
    const region = screen.getByRole("region", { name: "Restock next" });
    expect(within(region).getAllByRole("listitem")).toHaveLength(10);
    expect(within(region).getAllByRole("listitem")[0]).toHaveTextContent(
      "Restock product 1 · 0-3M0 leftsold 12 in 30 days · last sold 28 Sep",
    );
    fireEvent.click(within(region).getByRole("button", { name: "Show all 12" }));
    expect(within(region).getAllByRole("listitem")).toHaveLength(12);
    fireEvent.click(within(region).getByRole("button", { name: "Show fewer" }));
    expect(within(region).getAllByRole("listitem")).toHaveLength(10);
  });

  it("shows no button for 10 rows or fewer", () => {
    render(<StockList title="Restock next" rows={metrics.restock.slice(0, 10)} now={NOW} emptyTitle="none" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says on hand and never sold for an idle size", () => {
    render(<StockList title="Not selling" rows={metrics.not_selling} now={NOW} emptyTitle="none" />);
    expect(screen.getByRole("listitem")).toHaveTextContent("Boys Coord Set Navy · 4-5Y14 on handnever sold");
  });

  it("shows the empty state when there are no rows", () => {
    render(<StockList title="Restock next" rows={[]} now={NOW} emptyTitle="Nothing to restock — every size has 3 or more" />);
    expect(screen.getByText("Nothing to restock — every size has 3 or more")).toBeInTheDocument();
  });
});

describe("SizeGapGrid", () => {
  it("shows only products with an out-of-stock size by default, and all products on request", () => {
    render(<SizeGapGrid products={metrics.products} />);
    expect(screen.getByRole("radio", { name: "With gaps" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Girls Coord Set Blue Daisy")).toBeInTheDocument();
    expect(screen.queryByText("Boys Coord Set Navy")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "All products" }));
    expect(screen.getByText("Boys Coord Set Navy")).toBeInTheDocument();
  });

  it("prints each size and its stock, with the state as words, in catalog order", () => {
    render(<SizeGapGrid products={metrics.products} />);
    const chips = within(screen.getByRole("list", { name: "Girls Coord Set Blue Daisy sizes" })).getAllByRole("listitem");
    expect(chips.map((c) => c.textContent)).toEqual([
      "1-2Y · 3 (in stock)",
      "2-3Y · 0 (out)",
      "3-4Y · 1 (low)",
      "4-5Y · 0 (out)",
    ]);
    expect(chips.map((c) => c.getAttribute("data-state"))).toEqual(["in", "out", "low", "out"]);
  });

  it("says no size runs are broken when nothing is out", () => {
    render(<SizeGapGrid products={[{ slug: "p", name: "P", out: 0, sizes: [stockRow({ stock: 3, state: "in" })] }]} />);
    expect(screen.getByText("No size runs are broken")).toBeInTheDocument();
  });
});
