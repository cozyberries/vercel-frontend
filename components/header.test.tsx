// @vitest-environment jsdom
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// The server never knows who is signed in; the header hydrates late (inside a lazily loaded
// layout), by which time the auth provider in the browser already has the user.
const h = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  fullName: "Chandni",
  unread: 2,
  isAdmin: false,
}));

vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => ({ user: h.user, isAdmin: h.isAdmin ?? false }),
}));
vi.mock("@/hooks/useApiQueries", () => ({
  useNotifications: (userId?: string) => ({
    data: userId ? Array.from({ length: h.unread }, (_, i) => ({ id: `n${i}`, is_read: false })) : undefined,
  }),
  useProfileCombined: (userId?: string) => ({
    data: userId ? { profile: { full_name: h.fullName } } : undefined,
  }),
}));
vi.mock("@/components/wishlist-context", () => ({ useWishlist: () => ({ wishlist: [] }) }));
vi.mock("@/components/cart-context", () => ({ useCart: () => ({ cart: [] }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));
vi.mock("./HamburgerSheet", () => ({ HamburgerSheet: () => null }));

import Header from "./header";

const signedIn = { id: "u1", email: "asha@example.com" };

async function hydrateWithUserKnownInBrowser(browserUser: typeof signedIn | null) {
  h.user = null;
  const container = document.createElement("div");
  container.innerHTML = renderToString(<Header />);
  document.body.appendChild(container);

  h.user = browserUser;
  const recoverable = vi.fn();
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  await act(async () => {
    hydrateRoot(container, <Header />, { onRecoverableError: recoverable });
  });
  const hydrationErrors = [
    ...recoverable.mock.calls.map((c) => String(c[0])),
    ...consoleError.mock.calls.map((c) => String(c[0])).filter((m) => /hydrat|did not match|didn't match/i.test(m)),
  ];
  consoleError.mockRestore();
  return { container, hydrationErrors };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Header hydration", () => {
  it("hydrates without a mismatch when the browser already knows the signed-in user", async () => {
    const { hydrationErrors } = await hydrateWithUserKnownInBrowser(signedIn);
    expect(hydrationErrors).toEqual([]);
  });

  it("shows the signed-in bell, unread count and initials once hydrated", async () => {
    const { container } = await hydrateWithUserKnownInBrowser(signedIn);
    expect(container.querySelector('[aria-label="Go to notifications"]')?.textContent).toBe("2");
    expect(container.querySelector('a[href="/profile"]')?.textContent).toBe("C");
  });

  it("keeps the guest bell and profile icon for a signed-out visitor", async () => {
    const { container, hydrationErrors } = await hydrateWithUserKnownInBrowser(null);
    expect(hydrationErrors).toEqual([]);
    expect(container.querySelector('[aria-label="Toggle notifications"]')).not.toBeNull();
    expect(container.querySelector('a[href="/profile"]')?.textContent).toBe("");
  });

  it("shows one Admin entry only to admins", async () => {
    h.isAdmin = true;
    const { container } = await hydrateWithUserKnownInBrowser(signedIn);
    const link = container.querySelector('a[aria-label="Open admin"]');
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute("href", "/admin");
  });

  it("hides the Admin entry from customers", async () => {
    h.isAdmin = false;
    const { container } = await hydrateWithUserKnownInBrowser(signedIn);
    expect(container.querySelector('a[aria-label="Open admin"]')).toBeNull();
  });
});
