import { describe, expect, it } from "vitest";
import type { CartItem } from "@/components/cart-context";
import type { PendingAuthIntent } from "@/lib/auth/pending-auth-intent";
import {
  applyCartChanges,
  cartCountsFor,
  cartEditOutcome,
  diffCartDraft,
  inPlaceCartAction,
  pickSize,
  stepQuantity,
  stepSize,
  type CartChange,
  type SizeOption,
} from "./cart-edit";

// Editing the cart from the products page (2026-09-27): once a size was in the cart, the card and
// its picker could only add more — lowering, removing or swapping a size needed a trip to /cart.

const line = (overrides: Partial<CartItem>): CartItem => ({
  id: "frock",
  name: "Frock",
  price: 899,
  quantity: 1,
  ...overrides,
});

describe("cartCountsFor", () => {
  it("counts a size once whether the line was added with a colour (product page) or without (card)", () => {
    // Regression: the product page stores colour = product.colors[0], the card stores none, so the
    // same size had two cart keys and each page ignored the other's line.
    const cart = [
      line({ size: "1-2Y", color: "soft-pear", quantity: 1 }),
      line({ size: "1-2Y", quantity: 2 }),
      line({ size: "2-3Y", quantity: 1 }),
      line({ id: "romper", size: "1-2Y", quantity: 5 }),
    ];
    expect(cartCountsFor(cart, "frock")).toEqual({ "1-2Y": 3, "2-3Y": 1 });
  });

  it('keys a product without sizes as ""', () => {
    expect(cartCountsFor([line({ id: "jhabla", quantity: 2 })], "jhabla")).toEqual({ "": 2 });
  });

  it("returns nothing for a product that is not in the cart", () => {
    expect(cartCountsFor([line({ size: "1-2Y" })], "romper")).toEqual({});
  });
});

describe("pickSize", () => {
  it("leaves the draft alone when the size is already in the cart", () => {
    expect(pickSize({ "1-2Y": 1 }, { "1-2Y": 0 }, "1-2Y", 5)).toEqual({ "1-2Y": 0 });
  });

  it("adds one of a new size while keeping the edits made to sizes in the cart", () => {
    expect(pickSize({ "1-2Y": 1 }, { "1-2Y": 0 }, "2-3Y", 5)).toEqual({ "1-2Y": 0, "2-3Y": 1 });
  });

  it("moves the pick and its quantity between sizes that are not in the cart yet", () => {
    expect(pickSize({}, { "6-12M": 3 }, "1-2Y", 5)).toEqual({ "1-2Y": 3 });
  });

  it("caps the carried quantity at the new size's stock", () => {
    expect(pickSize({}, { "6-12M": 3 }, "1-2Y", 2)).toEqual({ "1-2Y": 2 });
  });

  it("keeps the quantity when the same new size is tapped again", () => {
    expect(pickSize({}, { "6-12M": 3 }, "6-12M", 5)).toEqual({ "6-12M": 3 });
  });

  it("moves only the new-size pick, never a size that is in the cart", () => {
    expect(pickSize({ "1-2Y": 1 }, { "1-2Y": 2, "6-12M": 1 }, "3-4Y", 5)).toEqual({ "1-2Y": 2, "3-4Y": 1 });
  });
});

describe("stepQuantity", () => {
  it("refuses to go below the floor or above the cap", () => {
    expect(stepQuantity(1, -1, 1, 5)).toBe(1);
    expect(stepQuantity(5, 1, 1, 5)).toBe(5);
    expect(stepQuantity(2, 1, 1, 5)).toBe(3);
  });

  it("still lets a count above the cap come down (stock fell after it was added)", () => {
    expect(stepQuantity(4, -1, 0, 2)).toBe(3);
    expect(stepQuantity(4, 1, 0, 2)).toBe(4);
  });
});

describe("stepSize", () => {
  it("lets a size in the cart go down to 0 and no further", () => {
    const once = stepSize({ "1-2Y": 1 }, {}, "1-2Y", -1, 5);
    expect(once).toEqual({ "1-2Y": 0 });
    expect(stepSize({ "1-2Y": 1 }, once, "1-2Y", -1, 5)).toEqual({ "1-2Y": 0 });
  });

  it("keeps the old floor of 1 when nothing of the product is in the cart", () => {
    expect(stepSize({}, { "1-2Y": 1 }, "1-2Y", -1, 5)).toEqual({ "1-2Y": 1 });
  });

  it("stops at the size's stock", () => {
    expect(stepSize({}, { "1-2Y": 2 }, "1-2Y", 1, 2)).toEqual({ "1-2Y": 2 });
  });
});

describe("diffCartDraft", () => {
  it("turns the draft into removes, adds and updates, skipping sizes left as they were", () => {
    const changes = diffCartDraft(
      { "1-2Y": 1, "3-4Y": 2 },
      { "1-2Y": 0, "2-3Y": 1, "3-4Y": 3, "4-5Y": 0 },
    );
    expect(changes).toEqual<CartChange[]>([
      { kind: "remove", size: "1-2Y", from: 1 },
      { kind: "add", size: "2-3Y", quantity: 1 },
      { kind: "update", size: "3-4Y", from: 2, quantity: 3 },
    ]);
  });

  it("returns no changes when every count matches the cart", () => {
    expect(diffCartDraft({ "1-2Y": 1 }, { "1-2Y": 1 })).toEqual([]);
  });
});

describe("cartEditOutcome", () => {
  it.each([
    ["nothing was in the cart", {}, { "1-2Y": 1 }, "added"],
    ["nothing changed", { "1-2Y": 1 }, { "1-2Y": 1 }, "none"],
    ["nothing was touched", { "1-2Y": 1 }, {}, "none"],
    ["the only size went to 0", { "1-2Y": 1 }, { "1-2Y": 0 }, "removed"],
    ["one size was swapped for another", { "1-2Y": 1 }, { "1-2Y": 0, "2-3Y": 1 }, "updated"],
    ["another size stays in the cart", { "1-2Y": 1, "4-5Y": 1 }, { "1-2Y": 0 }, "updated"],
  ])("%s", (_label, current, draft, expected) => {
    expect(cartEditOutcome(current, draft)).toBe(expected);
  });
});

describe("inPlaceCartAction", () => {
  it.each([
    [0, 1, "add"],
    [1, 1, "go-to-cart"],
    [1, 2, "update"],
    [2, 1, "update"],
    [1, 0, "remove"],
  ] as const)("in cart %i, quantity %i → %s", (inCart, quantity, expected) => {
    expect(inPlaceCartAction(inCart, quantity)).toBe(expected);
  });
});

describe("applyCartChanges", () => {
  const options: SizeOption[] = [
    { size: "1-2Y", price: 899, label: "1-2Y", stock: 4 },
    { size: "2-3Y", color: "Soft Pear", price: 749, label: "2-3Y / Soft Pear", stock: 4 },
  ];

  function recorder(gate: boolean) {
    const calls = {
      add: [] as CartItem[],
      update: [] as unknown[][],
      remove: [] as unknown[][],
      gate: [] as PendingAuthIntent[],
    };
    return {
      calls,
      deps: {
        addToCart: (item: CartItem) => calls.add.push(item),
        updateQuantity: (...args: unknown[]) => calls.update.push(args),
        removeFromCart: (...args: unknown[]) => calls.remove.push(args),
        requireAuthForIntent: (intent: PendingAuthIntent) => {
          calls.gate.push(intent);
          return gate;
        },
      },
    };
  }

  const product = { id: "frock", name: "Frock", image: "https://img/frock.jpg" };
  const inCart = [line({ size: "1-2Y", color: "soft-pear", quantity: 3 })];

  it("removes the size's line", () => {
    const { calls, deps } = recorder(true);
    applyCartChanges([{ kind: "remove", size: "1-2Y", from: 3 }], { product, options, cart: inCart, ...deps });
    expect(calls.remove).toEqual([["frock", "1-2Y", "soft-pear"]]);
    expect(calls.update).toEqual([]);
  });

  it("sets the new count on the size's line and removes nothing", () => {
    // The cart keys a line on product + size, so a remove issued for a "duplicate" would delete the
    // very line this update just set.
    const { calls, deps } = recorder(true);
    applyCartChanges([{ kind: "update", size: "1-2Y", from: 3, quantity: 2 }], { product, options, cart: inCart, ...deps });
    expect(calls.update).toEqual([["frock", 2, "1-2Y"]]);
    expect(calls.remove).toEqual([]);
  });

  it("adds a new size through the auth gate with that size's price, colour and stock", () => {
    const { calls, deps } = recorder(true);
    const ranHere = applyCartChanges([{ kind: "add", size: "2-3Y", quantity: 2 }], { product, options, cart: [], ...deps });
    const item = {
      id: "frock",
      name: "Frock",
      price: 749,
      image: "https://img/frock.jpg",
      quantity: 2,
      stock_quantity: 4,
      size: "2-3Y",
      color: "Soft Pear",
    };
    expect(calls.gate).toEqual([{ type: "cart", item }]);
    expect(calls.add).toEqual([item]);
    expect(ranHere).toBe(true);
  });

  it("leaves the add to the auth gate for a guest and says so", () => {
    const { calls, deps } = recorder(false);
    const ranHere = applyCartChanges([{ kind: "add", size: "1-2Y", quantity: 1 }], { product, options, cart: [], ...deps });
    expect(calls.gate).toHaveLength(1);
    expect(calls.add).toEqual([]);
    expect(ranHere).toBe(false);
  });

  it("adds a product without sizes with no size or colour on the line", () => {
    const { calls, deps } = recorder(true);
    applyCartChanges([{ kind: "add", size: "", quantity: 1 }], {
      product: { id: "jhabla", name: "Jhabla" },
      options: [{ price: 499, label: "Add", stock: 3 }],
      cart: [],
      ...deps,
    });
    expect(calls.add).toEqual([{ id: "jhabla", name: "Jhabla", price: 499, image: undefined, quantity: 1, stock_quantity: 3 }]);
  });
});
