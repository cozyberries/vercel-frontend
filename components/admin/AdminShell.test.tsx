// @vitest-environment jsdom
import { render, screen, fireEvent, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/admin" }));
const auth = vi.hoisted(() => ({ signOut: vi.fn(async () => ({ success: true })) }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => auth,
}));

import AdminShell, { PHONE_BANNER_KEY } from "./AdminShell";

function renderShell(over: Partial<React.ComponentProps<typeof AdminShell>> = {}) {
  return render(
    <AdminShell role="admin" hasPhone userId="u1" initials="A" {...over}>
      <p>page</p>
    </AdminShell>,
  );
}

beforeEach(() => {
  nav.pathname = "/admin";
  auth.signOut.mockClear();
  window.localStorage.clear();
});

describe("AdminShell", () => {
  it("renders the tab row, bottom bar and page", () => {
    renderShell();
    expect(screen.getByRole("navigation", { name: "Admin sections" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Quick access" })).toBeInTheDocument();
    expect(screen.getByText("page")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Store" })).toHaveAttribute("href", "/");
  });

  it("marks the current tab", () => {
    nav.pathname = "/admin/pickup-orders";
    renderShell();
    const tabs = screen.getByRole("navigation", { name: "Admin sections" });
    const active = tabs.querySelector('[aria-current="page"]');
    expect(active).toHaveTextContent("Pickups");
  });

  it("shows Admins only to a super_admin", () => {
    renderShell();
    expect(screen.queryByRole("link", { name: "Admins" })).not.toBeInTheDocument();
    renderShell({ role: "super_admin" });
    expect(screen.getByRole("link", { name: "Admins" })).toHaveAttribute("href", "/admin/admins");
  });

  it("renders bare children on print pages", () => {
    nav.pathname = "/admin/print/label/ORD-1";
    renderShell();
    expect(screen.getByText("page")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Admin sections" })).not.toBeInTheDocument();
  });

  it("shows the phone banner until dismissed, per user", () => {
    renderShell({ hasPhone: false });
    const banner = screen.getByRole("status", { name: "Add your phone" });
    expect(banner).toHaveTextContent("Add your phone to sign in by mobile");
    expect(screen.getByRole("link", { name: "Add phone" })).toHaveAttribute("href", "/profile#phone");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status", { name: "Add your phone" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(PHONE_BANNER_KEY("u1"))).toBe("1");
  });

  it("does not show the phone banner when a phone is set", () => {
    renderShell({ hasPhone: true });
    expect(screen.queryByRole("status", { name: "Add your phone" })).not.toBeInTheDocument();
  });

  it("marks the current item in the bottom bar with aria-current", () => {
    nav.pathname = "/admin/stall-refills";
    renderShell();
    const bottom = screen.getByRole("navigation", { name: "Quick access" });
    const active = bottom.querySelector('[aria-current="page"]');
    expect(active).toHaveTextContent("Refills");
  });

  it("fits all five quick-access items on one row", () => {
    renderShell();
    const bottom = screen.getByRole("navigation", { name: "Quick access" });
    expect(bottom.querySelector("ul")).toHaveClass("grid-cols-5");
    expect(within(bottom).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Dashboard", "Orders", "Pickups", "Refills", "Stock",
    ]);
  });

  it("signs out and navigates home when the menu item is chosen", async () => {
    const originalLocation = window.location;
    // jsdom throws "Not implemented: navigation" on a real href assignment;
    // swap in a writable stand-in so we can assert on it instead.
    // @ts-expect-error -- deliberately replacing a readonly global for the test
    delete window.location;
    // @ts-expect-error -- "webworker" in tsconfig lib makes the global `location`
    // setter type `string & Location`; the stand-in object is still a real Location.
    window.location = { ...originalLocation, href: "" } as Location;

    renderShell();
    const trigger = screen.getByRole("button", { name: "Account menu" });
    // Radix DropdownMenu opens on pointerdown; jsdom doesn't fire real pointer
    // events from a plain click, so trigger it explicitly.
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
    fireEvent.pointerUp(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
    fireEvent.click(trigger);

    const item = await screen.findByText("Sign out");
    fireEvent.click(item);

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(window.location.href).toBe("/");
    });

    // @ts-expect-error -- see the matching stand-in swap above.
    window.location = originalLocation;
  });
});
