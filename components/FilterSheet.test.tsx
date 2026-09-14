// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FilterSheet from "./FilterSheet";

// Regression (2026-09-14): the Design chips (Solid/Stripe/Polka/Floral/Check) and Colour swatches
// (Sage/Oat/Clay…) were hardcoded and never sent to the parent, so choosing one filtered nothing.
// They must render the catalog's prints and base colours and be applied like every other group.

const baseProps = {
  sizeOptions: [{ id: "0-3m", name: "0-3M", display_order: 1 }],
  genderOptions: [{ id: "girl", name: "Girl", display_order: 1 }],
  ageOptions: [{ id: "0-3m", slug: "0-3m", name: "0-3M", display_order: 1 }],
  designOptions: [
    { slug: "lilac-blossom", name: "Lilac Blossom" },
    { slug: "petal-pops", name: "Petal Pops" },
  ],
  colourOptions: [
    { slug: "lilac", name: "Lilac", hex: "#dccbe3" },
    { slug: "white", name: "White", hex: "#f7f5f0" },
  ],
  currentSize: "all",
  currentGender: "all",
  currentAge: "all",
  currentDesign: "all",
  currentColour: "all",
  itemCount: 12,
  onClearFilters: vi.fn(),
};

function openSheet(props: Partial<typeof baseProps> & { onApplyFilters: (v: unknown) => void }) {
  render(<FilterSheet {...baseProps} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /filters/i }));
  return screen.getByRole("dialog", { name: "Filters" });
}

describe("FilterSheet design and colour groups", () => {
  it("renders the catalog prints as Design chips and the base colours as Colour swatches", () => {
    const sheet = openSheet({ onApplyFilters: vi.fn() });
    expect(within(sheet).getByText("Design", { exact: true })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Lilac Blossom" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Petal Pops" })).toBeInTheDocument();
    expect(within(sheet).getByText("Colour", { exact: true })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Lilac" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "White" })).toBeInTheDocument();
    for (const placeholder of ["Solid", "Stripe", "Polka", "Floral", "Check", "Sage", "Oat", "Clay"]) {
      expect(within(sheet).queryByRole("button", { name: placeholder })).toBeNull();
    }
  });

  it("applies the chosen design and colour slugs together with the other groups", () => {
    const onApplyFilters = vi.fn();
    const sheet = openSheet({ onApplyFilters });
    fireEvent.click(within(sheet).getByRole("button", { name: "Petal Pops" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "White" }));
    fireEvent.click(within(sheet).getByRole("button", { name: /show 12 items/i }));
    expect(onApplyFilters).toHaveBeenCalledWith({
      size: "all",
      gender: "all",
      age: "all",
      design: "petal-pops",
      colour: "white",
    });
  });

  it("pre-selects the design and colour from the URL and toggles them off on a second tap", () => {
    const onApplyFilters = vi.fn();
    const sheet = openSheet({ onApplyFilters, currentDesign: "lilac-blossom", currentColour: "lilac" });
    expect(within(sheet).getByRole("button", { name: "Lilac Blossom" })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByRole("button", { name: "Lilac" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(sheet).getByRole("button", { name: "Lilac Blossom" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Lilac" }));
    fireEvent.click(within(sheet).getByRole("button", { name: /show 12 items/i }));
    expect(onApplyFilters).toHaveBeenCalledWith(expect.objectContaining({ design: "all", colour: "all" }));
  });

  it("hides a group whose option list is empty instead of showing placeholders", () => {
    const sheet = openSheet({ onApplyFilters: vi.fn(), designOptions: [], colourOptions: [] });
    expect(within(sheet).queryByText("Design", { exact: true })).toBeNull();
    expect(within(sheet).queryByText("Colour", { exact: true })).toBeNull();
  });
});
