// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SalesSection from "./sales-section";
import { emptySalesMetrics, salesMetricsFixture } from "@/lib/admin/__fixtures__/sales-metrics";
import { parseSalesRange } from "@/lib/admin/sales-range";

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const rangeOf = (input: RequestInfo | URL) => new URL(String(input), "http://localhost").searchParams.get("range") ?? "";

/** Serves salesMetricsFixture for whichever ?range= was asked, unless `respond` returns a response. */
function stubSales(respond?: (range: string) => Response | undefined) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const range = rangeOf(input);
    return respond?.(range) ?? json({ metrics: salesMetricsFixture({ range: parseSalesRange(range) ?? "3m" }), cached: false });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const requestedRanges = (f: ReturnType<typeof stubSales>) => f.mock.calls.map(([input]) => rangeOf(input));

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SalesSection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  window.history.replaceState(null, "", "/admin");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SalesSection", () => {
  it("defaults to 3 months and shows the four KPI tiles with their comparison", async () => {
    const f = stubSales();
    renderSection();
    expect(await screen.findByText("₹24,310")).toBeInTheDocument();
    expect(requestedRanges(f)).toEqual(["3m"]);
    expect(screen.getByRole("radio", { name: "3 months" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("↑ 18% vs previous 13 weeks")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("↑ 27% vs previous 13 weeks")).toBeInTheDocument();
    expect(screen.getByText("₹1,736")).toBeInTheDocument();
    expect(screen.getByText("↓ 7% vs previous 13 weeks")).toBeInTheDocument();
    expect(screen.getByText("2.3")).toBeInTheDocument();
    expect(screen.getByText("↑ 10% vs previous 13 weeks")).toBeInTheDocument();
  });

  it("seeds the range from ?range= and writes a new choice back to the URL", async () => {
    window.history.replaceState(null, "", "/admin?range=12m");
    const f = stubSales();
    renderSection();
    await screen.findByText("₹24,310");
    expect(requestedRanges(f)).toEqual(["12m"]);
    fireEvent.click(screen.getByRole("radio", { name: "30 days" }));
    await waitFor(() => expect(requestedRanges(f)).toEqual(["12m", "30d"]));
    expect(window.location.search).toBe("?range=30d");
    expect(screen.getByRole("radio", { name: "30 days" })).toHaveAttribute("aria-checked", "true");
  });

  it("falls back to 3 months for an unknown ?range=", async () => {
    window.history.replaceState(null, "", "/admin?range=7d");
    const f = stubSales();
    renderSection();
    await screen.findByText("₹24,310");
    expect(requestedRanges(f)).toEqual(["3m"]);
  });

  it("splits sales by channel in the share bar", async () => {
    stubSales();
    renderSection();
    const share = await screen.findByRole("region", { name: "Stall vs online sales" });
    expect(share).toHaveTextContent("Stall ₹15,200 · 63%");
    expect(share).toHaveTextContent("Online ₹9,110 · 37%");
  });

  it("lists every bucket in the Sales over time table", async () => {
    stubSales();
    renderSection();
    const card = await screen.findByRole("region", { name: "Sales over time" });
    expect(within(card).getByRole("list", { name: "Legend" })).toHaveTextContent("StallOnline");
    fireEvent.click(within(card).getByRole("button", { name: "View as table" }));
    expect(within(card).getAllByRole("row").map((r) => r.textContent)).toEqual([
      "Week ofStallOnlineTotal",
      "21 Sep₹0₹1,200₹1,200",
      "28 Sep₹15,200₹7,910₹23,110",
    ]);
  });

  it("lists orders and average order value per bucket in their tables", async () => {
    stubSales();
    renderSection();
    const orders = await screen.findByRole("region", { name: "Orders over time" });
    fireEvent.click(within(orders).getByRole("button", { name: "View as table" }));
    expect(within(orders).getAllByRole("row").map((r) => r.textContent)).toEqual([
      "Week ofStallOnlineTotal",
      "21 Sep011",
      "28 Sep9413",
    ]);
    const aov = screen.getByRole("region", { name: "Average order value" });
    fireEvent.click(within(aov).getByRole("button", { name: "View as table" }));
    expect(within(aov).getAllByRole("row").map((r) => r.textContent)).toEqual([
      "Week ofAvg order",
      "21 Sep₹1,200",
      "28 Sep₹1,778",
    ]);
  });

  it("keeps the chart grid within the phone width (explicit minmax(0,1fr) columns)", async () => {
    stubSales();
    renderSection();
    const card = await screen.findByRole("region", { name: "Sales over time" });
    const grid = card.parentElement!;
    expect(grid).toHaveClass("grid-cols-1", "lg:grid-cols-2", "items-start");
  });

  it("ranks products and categories with values, units and the line-value footnote", async () => {
    stubSales();
    renderSection();
    const products = await screen.findByRole("region", { name: "Top products" });
    expect(within(products).getByRole("listitem")).toHaveTextContent("Frill Sleeve Petal Pops₹6,120 · 9 units");
    expect(products).toHaveTextContent("Line value before order discounts and delivery, so these won't add up to Sales.");
    const categories = screen.getByRole("region", { name: "Categories" });
    expect(within(categories).getByRole("listitem")).toHaveTextContent("Frill Sleeve Muslin₹9,870 · 14 units");
  });

  it("shows the empty state, and no charts, when nothing sold in the period", async () => {
    stubSales(() => json({ metrics: emptySalesMetrics("3m"), cached: false }));
    renderSection();
    expect(await screen.findByText("No paid orders in the last 3 months")).toBeInTheDocument();
    expect(screen.getByText("₹0")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sales over time" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Stall vs online sales" })).not.toBeInTheDocument();
  });

  it("says since when for All time instead of comparing", async () => {
    window.history.replaceState(null, "", "/admin?range=all");
    stubSales(() =>
      json({
        metrics: salesMetricsFixture({
          range: "all",
          bucket: "month",
          previous: null,
          first_sale_at: "2026-02-28T14:15:41.000Z",
          kpis: {
            sales: { value: 65000, previous: null },
            orders: { value: 37, previous: null },
            aov: { value: 1756.76, previous: null },
            items_per_order: { value: 2.3, previous: null },
          },
        }),
        cached: false,
      }),
    );
    renderSection();
    expect(await screen.findByText("₹65,000")).toBeInTheDocument();
    expect(screen.getAllByText("since Feb 2026")).toHaveLength(4);
  });

  it("shows an error banner with Retry, and no stale numbers, when a chip switch fails", async () => {
    stubSales((range) => (range === "30d" ? json({ error: "Couldn't load sales" }, 500) : undefined));
    renderSection();
    await screen.findByText("₹24,310");
    fireEvent.click(screen.getByRole("radio", { name: "30 days" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load sales");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("₹24,310")).not.toBeInTheDocument();
  });

  it("offers a login link instead of Retry on 401", async () => {
    stubSales(() => json({ error: "Unauthorized" }, 401));
    renderSection();
    await screen.findByRole("alert");
    expect(screen.getByRole("link", { name: "Log in again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("keeps the previous numbers on screen, marked Updating…, while a new range loads", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const range = rangeOf(input);
        if (range === "12m") await gate;
        return json({ metrics: salesMetricsFixture({ range: parseSalesRange(range) ?? "3m" }), cached: false });
      }),
    );
    renderSection();
    await screen.findByText("₹24,310");
    fireEvent.click(screen.getByRole("radio", { name: "12 months" }));
    expect(await screen.findByText("Updating…")).toBeInTheDocument();
    expect(screen.getByText("₹24,310")).toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.queryByText("Updating…")).not.toBeInTheDocument());
  });
});
