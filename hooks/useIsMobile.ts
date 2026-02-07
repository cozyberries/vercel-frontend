import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 768; // Matches Tailwind's `md` breakpoint

/**
 * Returns `true` when the viewport is below the mobile breakpoint (< 768px),
 * `false` when at or above, and `null` during SSR / before the first
 * client-side measurement.
 *
 * Returning `null` initially lets consumers skip work (e.g. API fetches)
 * until the viewport is actually known, avoiding a double-fetch on desktop.
 */
export function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px)`);

    // Set initial value from the live media query
    setIsMobile(!mql.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsMobile(!e.matches);
    };

    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}
