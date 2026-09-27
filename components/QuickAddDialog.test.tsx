// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SizeCounts, SizeOption } from "@/lib/utils/cart-edit";

// Editing the cart from the products page (2026-09-27): the picker behind a card's ✓ could only
// add more, so a size already in the cart could not be lowered, removed or swapped outside /cart.

vi.mock("@/components/ui/supabase-image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("@/components/discounted-price", () => ({ default: ({ price }: { price: number }) => <span>₹{price}</span> }));

import QuickAddDialog from "./QuickAddDialog";

const sizes: SizeOption[] = ["6-12M", "1-2Y", "2-3Y", "3-4Y", "4-5Y"].map((size) => ({
  size,
  price: 734,
  label: size,
  stock: 5,
}));

function openPicker(cartCounts: SizeCounts, addOptions: SizeOption[] = sizes) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  const picker = (counts: SizeCounts) => (
    <QuickAddDialog
      open
      onOpenChange={onOpenChange}
      productName="Long Sleeve Pyjamas - Without Rib"
      addOptions={addOptions}
      cartCounts={counts}
      onConfirm={onConfirm}
    />
  );
  const { rerender } = render(picker(cartCounts));
  return { onConfirm, onOpenChange, cartChanged: (counts: SizeCounts) => rerender(picker(counts)) };
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const quantity = () => screen.getByRole("status", { name: "Quantity" });

describe("QuickAddDialog with the product already in the cart", () => {
  it("opens on the size in the cart and shows its count", () => {
    openPicker({ "1-2Y": 1 });
    expect(screen.getByRole("dialog", { name: "Edit cart" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1-2Y" })).toHaveAttribute("aria-pressed", "true");
    expect(quantity()).toHaveTextContent("1");
    expect(screen.getByText("In cart now: 1")).toBeInTheDocument();
  });

  it("tells screen readers the count on a size without changing the size's name", () => {
    openPicker({ "1-2Y": 2 });
    expect(screen.getByRole("button", { name: "1-2Y" })).toHaveAccessibleDescription("2 in cart");
    expect(screen.getByRole("button", { name: "2-3Y" })).not.toHaveAccessibleDescription();
  });

  it("keeps working from the cart as it was when opened, while the saved change lands", () => {
    // After Remove the cart empties during the close animation; the picker must not flip to
    // "Add to cart" / "Done" under the shopper's finger.
    const { cartChanged } = openPicker({ "1-2Y": 1 });
    click("Decrease quantity");
    cartChanged({});
    expect(screen.getByRole("dialog", { name: "Edit cart" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove from cart" })).toBeInTheDocument();
  });

  it("lets the count go to 0 and then saves a removal", () => {
    const { onConfirm, onOpenChange } = openPicker({ "1-2Y": 1 });
    click("Decrease quantity");
    expect(quantity()).toHaveTextContent("0");
    expect(screen.getByText("Will be removed")).toBeInTheDocument();
    click("Remove from cart");
    expect(onConfirm).toHaveBeenCalledWith([{ kind: "remove", size: "1-2Y", from: 1 }], "removed");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("swaps one size for another in a single save, listed in size order", () => {
    const { onConfirm } = openPicker({ "1-2Y": 1 });
    click("2-3Y");
    click("1-2Y");
    click("Decrease quantity");
    click(/^Update cart · ₹734$/);
    expect(onConfirm).toHaveBeenCalledWith([
      { kind: "remove", size: "1-2Y", from: 1 },
      { kind: "add", size: "2-3Y", quantity: 1 },
    ], "updated");
  });

  it("closes without touching the cart when nothing changed", () => {
    const { onConfirm, onOpenChange } = openPicker({ "1-2Y": 1 });
    click("Done");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("stops at the size's stock", () => {
    openPicker({ "1-2Y": 1 }, sizes.map((o) => (o.size === "1-2Y" ? { ...o, stock: 2 } : o)));
    click("Increase quantity");
    expect(quantity()).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
  });

  it("edits the single line of a product without sizes", () => {
    const { onConfirm } = openPicker({ "": 2 }, [{ price: 499, label: "Add", stock: 3 }]);
    expect(screen.queryByText("Select age / size")).not.toBeInTheDocument();
    expect(quantity()).toHaveTextContent("2");
    click("Decrease quantity");
    click("Decrease quantity");
    click("Remove from cart");
    expect(onConfirm).toHaveBeenCalledWith([{ kind: "remove", size: "", from: 2 }], "removed");
  });
});

describe("QuickAddDialog with nothing of the product in the cart", () => {
  it("adds one size, carrying the quantity when the pick moves", () => {
    const { onConfirm } = openPicker({});
    expect(screen.getByRole("dialog", { name: "Add to cart" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select a size" })).toBeDisabled();
    click("6-12M");
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
    click("Increase quantity");
    click("1-2Y");
    expect(quantity()).toHaveTextContent("2");
    click(/^Add · ₹1,468$/);
    expect(onConfirm).toHaveBeenCalledWith([{ kind: "add", size: "1-2Y", quantity: 2 }], "added");
  });
});
