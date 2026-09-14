// Grid vs list on /products. Mobile shows the list by default and `?view=grid` opts into the grid;
// desktop is always a grid. Pure so it can be unit-tested and used during server rendering.

export type ProductView = "grid" | "list";

export function resolveProductView(viewParam: string | null, isMobile: boolean | null): ProductView {
  if (isMobile === false) return "grid";
  return viewParam === "grid" ? "grid" : "list";
}

/** URL value for a chosen view: list is the default, so only grid is written. */
export function viewParamFor(view: ProductView): string | null {
  return view === "grid" ? "grid" : null;
}
