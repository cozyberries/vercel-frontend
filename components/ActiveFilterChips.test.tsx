// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ActiveFilterChips from "./ActiveFilterChips";

// Regression (2026-09-14): applied filters were invisible on the results screen.

const chips = [
  { param: "age" as const, label: "Age", value: "3-6 Years" },
  { param: "colour" as const, label: "Colour", value: "Pink" },
];

describe("ActiveFilterChips", () => {
  it("shows one removable chip per active filter plus Clear all", () => {
    const onRemove = vi.fn();
    const onClearAll = vi.fn();
    render(<ActiveFilterChips chips={chips} onRemove={onRemove} onClearAll={onClearAll} />);
    expect(screen.getByText("3-6 Years")).toBeInTheDocument();
    expect(screen.getByText("Pink")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Colour filter Pink" }));
    expect(onRemove).toHaveBeenCalledWith("colour");
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it("still offers Clear all when only non-chip filters (search, sort) are active", () => {
    render(<ActiveFilterChips chips={[]} onRemove={vi.fn()} onClearAll={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Clear all filters" })).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(1);
  });
});
