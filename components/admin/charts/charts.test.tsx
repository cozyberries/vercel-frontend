// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChartCard, CHART_COLORS, RankBars, ShareBar, StackedColumns, ValueLine } from "./index";

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const rupees = (n: number | null) => (n === null ? "—" : `₹${n}`);

describe("CHART_COLORS", () => {
  it("keeps the validated palette (re-run the dataviz validator before changing it)", () => {
    expect(CHART_COLORS).toEqual({ stall: "#c4703f", online: "#2f7fc0", neutral: "#8a6b63" });
  });
});

describe("ChartCard", () => {
  const table = {
    columns: [
      { key: "label", label: "Day" },
      { key: "total", label: "Total", numeric: true },
    ],
    rows: [
      { label: "1 Oct", total: "₹1,200" },
      { label: "2 Oct", total: "₹0" },
    ],
  };

  it("is a region named by its title, with a legend when there are two series", () => {
    render(
      <ChartCard
        title="Sales over time"
        legend={[
          { label: "Stall", color: CHART_COLORS.stall },
          { label: "Online", color: CHART_COLORS.online },
        ]}
      >
        <p>chart</p>
      </ChartCard>,
    );
    const region = screen.getByRole("region", { name: "Sales over time" });
    expect(within(region).getByRole("list", { name: "Legend" })).toHaveTextContent("StallOnline");
    expect(within(region).getByText("chart")).toBeInTheDocument();
  });

  it("swaps the chart for a table and back", () => {
    render(
      <ChartCard title="Sales over time" table={table}>
        <p>chart</p>
      </ChartCard>,
    );
    fireEvent.click(screen.getByRole("button", { name: "View as table" }));
    expect(screen.getAllByRole("row").map((r) => r.textContent)).toEqual(["DayTotal", "1 Oct₹1,200", "2 Oct₹0"]);
    expect(screen.queryByText("chart")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View as chart" }));
    expect(screen.getByText("chart")).toBeInTheDocument();
  });

  it("has no toggle without a table, and shows the footnote", () => {
    render(
      <ChartCard title="Top products" footnote="Line value before order discounts.">
        <p>bars</p>
      </ChartCard>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Line value before order discounts.")).toBeInTheDocument();
  });

  it("can never force its grid column wider than the phone (min-w-0)", () => {
    render(
      <ChartCard title="Top products">
        <p>bars</p>
      </ChartCard>,
    );
    expect(screen.getByRole("region", { name: "Top products" })).toHaveClass("min-w-0");
  });
});

describe("RankBars", () => {
  it("prints every row's value and units, with the longest bar for the largest value", () => {
    render(
      <RankBars
        rows={[
          { key: "a", name: "Frill Sleeve Petal Pops", value: 6120, units: 9 },
          { key: "b", name: "Pyjamas", value: 3060, units: 1 },
        ]}
        format={rupees}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Frill Sleeve Petal Pops₹6120 · 9 units");
    expect(items[1]).toHaveTextContent("Pyjamas₹3060 · 1 unit");
    expect(items.map((li) => (li.querySelector("[data-bar]") as HTMLElement).style.width)).toEqual(["100%", "50%"]);
  });
});

describe("ShareBar", () => {
  it("labels both channels with rupees and percentages that add up to 100", () => {
    render(<ShareBar stall={2} online={1} format={rupees} />);
    const region = screen.getByRole("region", { name: "Stall vs online sales" });
    expect(region).toHaveTextContent("Stall ₹2 · 67%");
    expect(region).toHaveTextContent("Online ₹1 · 33%");
  });

  it("keeps each legend item whole when the row wraps on a narrow screen", () => {
    render(<ShareBar stall={2} online={1} format={rupees} />);
    const items = within(screen.getByRole("region", { name: "Stall vs online sales" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    items.forEach((li) => expect(li).toHaveClass("whitespace-nowrap"));
  });

  it("draws one full-width part when only one channel sold", () => {
    const { container } = render(<ShareBar stall={500} online={0} format={rupees} />);
    const parts = container.querySelectorAll("[data-share-part]");
    expect(parts).toHaveLength(1);
    expect((parts[0] as HTMLElement).style.width).toBe("100%");
  });

  it("renders nothing when there are no sales", () => {
    const { container } = render(<ShareBar stall={0} online={0} format={rupees} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Recharts charts", () => {
  it("mount without throwing in a DOM that has no layout", () => {
    expect(() =>
      render(<StackedColumns data={[{ label: "1 Oct", stall: 1, online: 2 }]} format={String} formatAxis={String} />),
    ).not.toThrow();
    expect(() =>
      render(
        <ValueLine
          data={[
            { label: "1 Oct", value: 1 },
            { label: "2 Oct", value: null },
          ]}
          name="Avg order"
          format={rupees}
          formatAxis={String}
        />,
      ),
    ).not.toThrow();
  });
});
