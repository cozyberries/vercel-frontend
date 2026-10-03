"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, ClipboardList, LayoutDashboard, LogOut, PackagePlus, Store, X } from "lucide-react";
import { useAuth } from "@/components/supabase-auth-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ADMIN_TABS, isActiveTab, tabsForRole, type AdminRole } from "./nav";

export const PHONE_BANNER_KEY = (userId: string) => `admin-phone-banner-dismissed:${userId}`;

const BOTTOM_ICONS: Record<string, typeof Store> = {
  "/admin": LayoutDashboard,
  "/admin/orders": ClipboardList,
  "/admin/pickup-orders": Store,
  "/admin/stall-refills": PackagePlus,
  "/admin/stock": Boxes,
};

export default function AdminShell({
  role,
  hasPhone,
  userId,
  initials,
  children,
}: {
  role: AdminRole;
  hasPhone: boolean;
  userId: string;
  initials: string;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/admin";
  const { signOut } = useAuth();
  const tabs = tabsForRole(role);
  const [bannerDismissed, setBannerDismissed] = useState(true);

  useEffect(() => {
    try {
      setBannerDismissed(window.localStorage.getItem(PHONE_BANNER_KEY(userId)) === "1");
    } catch {
      setBannerDismissed(false);
    }
  }, [userId]);

  if (pathname.startsWith("/admin/print")) return <>{children}</>;

  const dismissBanner = () => {
    setBannerDismissed(true);
    try {
      window.localStorage.setItem(PHONE_BANNER_KEY(userId), "1");
    } catch {
      /* private mode: banner returns next load, which is fine */
    }
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/";
  };

  return (
    <div className="flex min-h-screen flex-col bg-cb-cream text-cb-fg">
      <header className="sticky top-0 z-20 bg-cb-white/95 backdrop-blur-sm">
        <div className="container mx-auto flex h-12 items-center justify-between px-4">
          <Link href="/admin" className="flex items-baseline gap-1.5 font-semibold tracking-tight">
            CozyBerries <span className="text-xs font-medium uppercase tracking-wider text-cb-muted-fg">Admin</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-cb-muted-fg">
              Store
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Account menu"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-cb-taupe text-xs font-semibold text-white"
              >
                {initials}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void handleSignOut()}>
                  <LogOut className="mr-2 h-4 w-4" aria-hidden />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <nav aria-label="Admin sections" className="border-b border-cb-border bg-cb-white">
          <ul className="container mx-auto flex gap-1 overflow-x-auto px-4 py-2 lg:flex-wrap">
            {tabs.map((t) => {
              const active = isActiveTab(pathname, t);
              return (
                <li key={t.href} className="shrink-0">
                  <Link
                    href={t.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-full px-3 py-1.5 text-sm font-medium ${
                      active ? "bg-cb-fg text-white" : "text-cb-muted-fg hover:bg-cb-linen"
                    }`}
                  >
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="container mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-2 lg:pb-8">
        {!hasPhone && !bannerDismissed && (
          <div
            role="status"
            aria-label="Add your phone"
            className="mb-4 flex items-center gap-3 rounded-2xl border border-cb-border bg-cb-white px-4 py-3 text-sm"
          >
            <span className="flex-1">Add your phone to sign in by mobile.</span>
            <Link href="/profile#phone" className="font-semibold text-cb-terracotta">
              Add phone
            </Link>
            <button type="button" aria-label="Dismiss" onClick={dismissBanner} className="text-cb-muted-fg">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
        {children}
      </main>

      <nav
        aria-label="Quick access"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-cb-border bg-cb-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {ADMIN_TABS.filter((t) => t.bottom).map((t) => {
            const active = isActiveTab(pathname, t);
            const Icon = BOTTOM_ICONS[t.href] ?? Store;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                    active ? "text-cb-terracotta" : "text-cb-muted-fg"
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
