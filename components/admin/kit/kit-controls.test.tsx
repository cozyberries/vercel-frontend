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

  it("hides badge when count is 0 and marks inactive tab", () => {
    render(
      <SegmentedTabs
        label="Queue"
        tabs={[
          { key: "a", label: "Awaiting ✅", count: 2 },
          { key: "r", label: "Ready", count: 0 },
        ]}
        value="a"
        onChange={() => {}}
      />,
    );
    const ready = screen.getByRole("tab", { name: "Ready" });
    expect(ready).toHaveTextContent(/^Ready$/);
    expect(ready).toHaveAttribute("aria-selected", "false");
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

  it("marks unchecked chip with aria-checked=false", () => {
    render(
      <FilterChips
        label="Days"
        chips={[
          { value: "7", label: "7d" },
          { value: "30", label: "30d" },
        ]}
        value="7"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("radio", { name: "30d" })).toHaveAttribute("aria-checked", "false");
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

  it("renders as div when href is not given", () => {
    render(<StatTile label="To ship" value={5} />);
    expect(screen.queryByRole("link", { name: /To ship/ })).toBeNull();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("applies terracotta tone only when value > 0", () => {
    const { rerender } = render(
      <StatTile label="Count" value={0} tone="attention" />,
    );
    const zeroValue = screen.getByText("0");
    expect(zeroValue).not.toHaveClass("text-cb-terracotta");

    rerender(<StatTile label="Count" value={3} tone="attention" />);
    const threeValue = screen.getByText("3");
    expect(threeValue).toHaveClass("text-cb-terracotta");
  });

  it("renders hint text when provided", () => {
    render(
      <StatTile label="Revenue" value={1500} hint="last 7 days" />,
    );
    expect(screen.getByText("last 7 days")).toBeInTheDocument();
  });
});
