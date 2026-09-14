// What the header's search icon does. Kept free of Next imports so it is trivially testable and
// safe to use from components rendered on static pages.

/** Appended to /products so the page focuses its search box on arrival; stripped once used. */
export const SEARCH_HASH = "#search";
/** Dispatched on `window` when the user is already on /products: focus the box, keep the URL. */
export const FOCUS_SEARCH_EVENT = "cozyberries:focus-search";

export type SearchIconAction = { kind: "focus" } | { kind: "navigate"; href: string };

export function searchIconAction(pathname: string): SearchIconAction {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/products") return { kind: "focus" };
  return { kind: "navigate", href: `/products${SEARCH_HASH}` };
}
