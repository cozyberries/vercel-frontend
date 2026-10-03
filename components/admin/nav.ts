export type AdminRole = "admin" | "super_admin";

export interface AdminTab {
  href: string;
  label: string;
  /** Match the pathname exactly instead of by prefix. */
  exact?: boolean;
  /** Also shown in the phone bottom bar. */
  bottom?: boolean;
  superAdminOnly?: boolean;
}

export const ADMIN_TABS: readonly AdminTab[] = [
  { href: "/admin", label: "Dashboard", exact: true, bottom: true },
  { href: "/admin/orders", label: "Orders", bottom: true },
  { href: "/admin/pickup-orders", label: "Pickups", bottom: true },
  { href: "/admin/stall-refills", label: "Refills", bottom: true },
  { href: "/admin/stock", label: "Stock", bottom: true },
  { href: "/admin/on-behalf-orders", label: "On-behalf" },
  { href: "/admin/impersonate", label: "Impersonate" },
  { href: "/admin/admins", label: "Admins", superAdminOnly: true },
];

export function isActiveTab(pathname: string, tab: AdminTab): boolean {
  if (tab.exact) return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

export function tabsForRole(role: AdminRole): AdminTab[] {
  return ADMIN_TABS.filter((t) => !t.superAdminOnly || role === "super_admin");
}
