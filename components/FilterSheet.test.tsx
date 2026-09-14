// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import FilterSheet from "./FilterSheet";
import { DEFAULT_FILTERS } from "@/lib/catalog/filter";
import type { ListCard } from "@/lib/catalog/types";

// Regression (2026-09-14): the Design chips (Solid/Stripe/Polka/Floral/Check) and Colour swatches
// (Sage/Oat/Clay…) were hardcoded and never sent to the parent, so choosing one filtered nothing.
// They must render the catalog's prints and base colours and be applied like every other group.

const baseProps = {
  genderOptions: [{ id: "girl", name: "Girl", display_order: 1 }],
  ageOptions: [
    { id: "0-3m", slug: "0-3m", name: "0-3M", display_order: 1 },
    { id: "3-6y", slug: "3-6y", name: "3-6 Years", display_order: 1000 },
  ],
  designOptions: [
    { slug: "lilac-blossom", name: "Lilac Blossom" },
    { slug: "petal-pops", name: "Petal Pops" },
  ],
  colourOptions: [
    { slug: "lilac", name: "Lilac", hex: "#dccbe3" },
    { slug: "white", name: "White", hex: "#f7f5f0" },
  ],
  currentGender: "all",
  currentAge: "all",
  currentDesign: "all",
  currentColour: "all",
  itemCount: 12,
  onClearFilters: vi.fn(),
};

type SheetProps = Partial<ComponentProps<typeof FilterSheet>> & { onApplyFilters: (v: unknown) => void };
function openSheet(props: SheetProps) {
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

  // Regression (2026-09-14): Age and Size listed the same values twice. Size and age are one axis
  // in this store, so the sheet offers Age only (the homepage bands) and applies it as `age`.
  it("offers Age but no separate Size group, and applies the chosen age band", () => {
    const onApplyFilters = vi.fn();
    const sheet = openSheet({ onApplyFilters });
    expect(within(sheet).getByText("Age", { exact: true })).toBeInTheDocument();
    expect(within(sheet).queryByText("Size", { exact: true })).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "3-6 Years" }));
    fireEvent.click(within(sheet).getByRole("button", { name: /show 12 items/i }));
    expect(onApplyFilters).toHaveBeenCalledWith(expect.objectContaining({ age: "3-6y" }));
    expect(onApplyFilters.mock.calls[0]![0]).not.toHaveProperty("size");
  });

  // Regression (2026-09-14): swatches had a white border on a white sheet, so the White swatch vanished.
  it("draws every swatch with a visible neutral border, not a white one", () => {
    const sheet = openSheet({ onApplyFilters: vi.fn() });
    const white = within(sheet).getByTestId("swatch-white");
    expect(white.className).toContain("border-cb-border");
    expect(white.className).not.toContain("border-white");
  });

  it("shows a tick on the selected swatch only, and drops it when deselected", () => {
    const sheet = openSheet({ onApplyFilters: vi.fn(), currentColour: "white" });
    expect(within(within(sheet).getByTestId("swatch-white")).getByTestId("swatch-check")).toBeInTheDocument();
    expect(within(within(sheet).getByTestId("swatch-lilac")).queryByTestId("swatch-check")).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "Lilac" }));
    expect(within(within(sheet).getByTestId("swatch-lilac")).getByTestId("swatch-check")).toBeInTheDocument();
    expect(within(within(sheet).getByTestId("swatch-white")).queryByTestId("swatch-check")).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "Lilac" }));
    expect(within(sheet).queryAllByTestId("swatch-check")).toHaveLength(0);
  });

  // Regression (2026-09-14): ?gender=Girl is parsed to "girl", so reopening the sheet never showed
  // the Girl chip as selected and a second tap selected it again instead of clearing it.
  it("pre-selects the gender from the URL regardless of case and toggles it off", () => {
    const onApplyFilters = vi.fn();
    const sheet = openSheet({ onApplyFilters, currentGender: "girl" });
    const girl = within(sheet).getByRole("button", { name: "Girl" });
    expect(girl).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(girl);
    expect(girl).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(sheet).getByRole("button", { name: /show 12 items/i }));
    expect(onApplyFilters).toHaveBeenCalledWith(expect.objectContaining({ gender: "all" }));
  });

  // 2026-09-14: options are re-counted against the pending choices; dead ends are greyed out.
  describe("dynamic availability", () => {
    const card = (slug: string, gender: string, sizes: string[], print: string, colour: string): ListCard =>
      ({
        id: slug, slug, name: slug, description: "", price: 500, min_price: 500, stock_quantity: 1, in_stock: true,
        is_featured: false, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
        category_slug: "frocks", gender_slug: gender, size_slugs: sizes, color_slugs: [print], base_colors: [colour],
        age_slugs: sizes, categories: null, genders: null, category: "Frocks", images: [], sizes: [], colors: [print],
      }) as ListCard;
    // Lilac Blossom exists only as a 0-3M girls' romper; Petal Pops only as a 3-4Y unisex coord set.
    const products = [
      card("lilac-romper", "girl", ["0-3m"], "lilac-blossom", "lilac"),
      card("petal-coord", "unisex", ["3-4y"], "petal-pops", "white"),
    ];
    const withProducts = { products, baseFilters: DEFAULT_FILTERS };

    it("greys out options that would leave zero products once a colour is chosen", () => {
      const sheet = openSheet({ onApplyFilters: vi.fn(), ...withProducts });
      expect(within(sheet).getByRole("button", { name: "3-6 Years" })).toBeEnabled();
      fireEvent.click(within(sheet).getByRole("button", { name: "Lilac" }));
      expect(within(sheet).getByRole("button", { name: "3-6 Years" })).toBeDisabled();
      expect(within(sheet).getByRole("button", { name: "0-3M" })).toBeEnabled();
      expect(within(sheet).getByRole("button", { name: "Petal Pops" })).toBeDisabled();
      expect(within(sheet).getByRole("button", { name: "Lilac Blossom" })).toBeEnabled();
      // Other colours stay selectable so the shopper can switch rather than clear first.
      expect(within(sheet).getByRole("button", { name: "White" })).toBeEnabled();
    });

    it("never disables the selected option and re-enables everything when it is cleared", () => {
      const sheet = openSheet({ onApplyFilters: vi.fn(), ...withProducts, currentDesign: "petal-pops" });
      expect(within(sheet).getByRole("button", { name: "Petal Pops" })).toBeEnabled();
      expect(within(sheet).getByRole("button", { name: "Lilac" })).toBeDisabled();
      fireEvent.click(within(sheet).getByRole("button", { name: "Petal Pops" }));
      expect(within(sheet).getByRole("button", { name: "Lilac" })).toBeEnabled();
    });

    it("honours filters applied outside the sheet, such as the category chips", () => {
      const sheet = openSheet({ onApplyFilters: vi.fn(), products, baseFilters: { ...DEFAULT_FILTERS, category: "pyjamas" } });
      // Nothing is in "pyjamas", so every option is a dead end.
      expect(within(sheet).getByRole("button", { name: "Lilac" })).toBeDisabled();
      expect(within(sheet).getByRole("button", { name: "Girl" })).toBeDisabled();
    });

    it("disables nothing when no catalogue is provided", () => {
      const sheet = openSheet({ onApplyFilters: vi.fn() });
      for (const name of ["Girl", "3-6 Years", "Petal Pops", "White"]) {
        expect(within(sheet).getByRole("button", { name })).toBeEnabled();
      }
    });
  });

  it("hides a group whose option list is empty instead of showing placeholders", () => {
    const sheet = openSheet({ onApplyFilters: vi.fn(), designOptions: [], colourOptions: [] });
    expect(within(sheet).queryByText("Design", { exact: true })).toBeNull();
    expect(within(sheet).queryByText("Colour", { exact: true })).toBeNull();
  });
});
