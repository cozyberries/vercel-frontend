import { describe, expect, it } from "vitest";
import { ADMIN_TABS, isActiveTab, tabsForRole } from "./nav";

describe("admin nav", () => {
  it("lists tabs in order with the bottom-bar five flagged", () => {
    expect(ADMIN_TABS.map((t) => t.label)).toEqual([
      "Dashboard", "Orders", "Pickups", "Refills", "Stock", "On-behalf", "Impersonate", "Admins",
    ]);
    expect(ADMIN_TABS.filter((t) => t.bottom).map((t) => t.label)).toEqual([
      "Dashboard", "Orders", "Pickups", "Refills", "Stock",
    ]);
  });
  it("shows Stock to admins and super admins", () => {
    expect(tabsForRole("admin").some((t) => t.href === "/admin/stock")).toBe(true);
    expect(tabsForRole("super_admin").some((t) => t.href === "/admin/stock")).toBe(true);
  });
  it("hides Admins from a plain admin", () => {
    expect(tabsForRole("admin").some((t) => t.label === "Admins")).toBe(false);
    expect(tabsForRole("super_admin").some((t) => t.label === "Admins")).toBe(true);
  });
  it("matches Dashboard exactly and the others by prefix", () => {
    const dash = ADMIN_TABS[0];
    const orders = ADMIN_TABS[1];
    expect(isActiveTab("/admin", dash)).toBe(true);
    expect(isActiveTab("/admin/orders", dash)).toBe(false);
    expect(isActiveTab("/admin/orders", orders)).toBe(true);
    expect(isActiveTab("/admin/orders/abc", orders)).toBe(true);
  });
  it("matches no tab for the print route", () => {
    expect(ADMIN_TABS.some((t) => isActiveTab("/admin/print/label/x", t))).toBe(false);
  });
});
