// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedTabs, FilterChips, StatTile, StatGrid } from "./index";

describe("SegmentedTabs", () => {
  it("marks the active tab, shows counts and reports changes", () => {
    const onChange = vi.fn();
    render(
      <SegmentedTabs
        label="Pickup queue"
        tabs={[
          { key: "awaiting", label: "Awaiting ✅", count: 2 },
          { key: "ready", label: "Ready", count: 0 },
        ]}
        value="ready"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("tablist", { name: "Pickup queue" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ready" })).toHaveAttribute("aria-selected", "true");
    const awaiting = screen.getByRole("tab", { name: /Awaiting/ });
    expect(awaiting).toHaveTextContent("2");
    fireEvent.click(awaiting);
    expect(onChange).toHaveBeenCalledWith("awaiting");
  });
});

describe("FilterChips", () => {
  it("is a radiogroup with one checked chip", () => {
    const onChange = vi.fn();
    render(
      <FilterChips
        label="Days"
        chips={[
          { value: "7", label: "7d" },
          { value: "30", label: "30d" },
        ]}
        value="7"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("radio", { name: "7d" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "30d" }));
    expect(onChange).toHaveBeenCalledWith("30");
  });
});

describe("StatTile", () => {
  it("renders as a link when href is given", () => {
    render(
      <StatGrid>
        <StatTile label="Awaiting ✅" value={3} href="/admin/pickup-orders" tone="attention" />
        <StatTile label="To ship" value={0} />
      </StatGrid>,
    );
    const link = screen.getByRole("link", { name: /Awaiting/ });
    expect(link).toHaveAttribute("href", "/admin/pickup-orders");
    expect(link).toHaveTextContent("3");
    expect(screen.getByText("To ship")).toBeInTheDocument();
  });
});
