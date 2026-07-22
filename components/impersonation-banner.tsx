"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/supabase-auth-provider";

/**
 * Sticky top banner visible whenever `useAuth().impersonation.active` is
 * true. Non-dismissible by design — the only way to hide it is to press
 * Exit, which stops impersonation via the server. Placed above every
 * existing layer via `z-[10000]` (notably above the `NotificationCenter`
 * popover at `z-[9999]`); the banner must remain visible during every
 * shadow-mode action so the admin can't forget they are impersonating.
 */
export function ImpersonationBanner() {
  const { impersonation, stopImpersonation } = useAuth();
  const [isExiting, setIsExiting] = useState(false);

  const target = impersonation.active ? impersonation.target : null;

  useEffect(() => {
    if (!target || typeof document === "undefined") return;
    const originalTitle = document.title;
    const prefix = `[Impersonating as ${target.full_name ?? "user"}] `;
    if (!originalTitle.startsWith(prefix)) {
      document.title = `${prefix}${originalTitle}`;
    }
    return () => {
      const current = document.title;
      if (current.startsWith(prefix)) {
        document.title = current.slice(prefix.length);
      }
    };
  }, [target]);

  if (!impersonation.active || !target) {
    return null;
  }

  const handleExit = async () => {
    if (isExiting) return;
    setIsExiting(true);
    try {
      await stopImpersonation();
      // Hard reload so every client hook (cart, wishlist, profile) refetches
      // against the admin's own session instead of reusing state that was
      // cached while impersonating. `router.refresh()` only re-runs Server
      // Components and leaves client caches untouched, which would keep
      // showing the target user's data after exit.
      if (typeof window !== "undefined") {
        window.location.reload();
        return;
      }
    } finally {
      setIsExiting(false);
    }
  };

  const displayName = target.full_name ?? "(unnamed)";
  const displayEmail = target.email ?? "no email";

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[10000] w-full bg-red-600 text-white shadow-md"
    >
      <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-3 px-4 py-2 text-sm font-medium">
        <span className="truncate">
          Impersonating as {displayName} ({displayEmail})
        </span>
        <button
          type="button"
          onClick={handleExit}
          disabled={isExiting}
          className="shrink-0 rounded-md bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isExiting ? "Exiting…" : "Exit"}
        </button>
      </div>
    </div>
  );
}

export default ImpersonationBanner;
