"use client";

import { Serwist } from "@serwist/window";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    serwist?: Serwist;
  }
}

/**
 * Client component that enables automatic PWA updates on all devices (including mobile).
 * - When a new service worker is waiting: tells it to activate (skipWaiting) and reloads when it takes control.
 * - When the app becomes visible again (e.g. user returns to the tab): checks for SW updates.
 * Requires @serwist/next to have registered the SW (window.serwist). Renders nothing.
 */
export default function PwaUpdateHandler() {
  const attachedRef = useRef(false);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const getSerwist = () => window.serwist;

    const attachUpdateHandlers = (serwist: Serwist) => {
      if (attachedRef.current) return;
      attachedRef.current = true;

      serwist.addEventListener("waiting", () => {
        const onControlling = () => {
          serwist.removeEventListener("controlling", onControlling);
          window.location.reload();
        };
        serwist.addEventListener("controlling", onControlling);
        serwist.messageSkipWaiting();
      });

      const checkForUpdates = () => {
        serwist.update().catch((err) => {
          console.error("[PwaUpdateHandler] checkForUpdates failed:", err);
        });
      };
      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") checkForUpdates();
      };
      visibilityHandlerRef.current = handleVisibilityChange;
      document.addEventListener("visibilitychange", handleVisibilityChange);
    };

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const maxAttempts = 25;
    const intervalMs = 200;

    const tryAttach = () => {
      const serwist = getSerwist();
      if (serwist) {
        attachUpdateHandlers(serwist);
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        timeoutId = setTimeout(tryAttach, intervalMs);
      }
    };

    tryAttach();
    return () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (visibilityHandlerRef.current) {
        document.removeEventListener("visibilitychange", visibilityHandlerRef.current);
        visibilityHandlerRef.current = null;
      }
    };
  }, []);

  return null;
}
