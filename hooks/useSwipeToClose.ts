"use client";

import { useRef, useCallback } from "react";

const MIN_SWIPE_PX = 50;

/**
 * Returns touch handlers to close a sheet when the user swipes in the given direction.
 * - direction "right": close on swipe right (e.g. right-side sheet)
 * - direction "left": close on swipe left (e.g. left-side sheet)
 * Only triggers when horizontal movement exceeds vertical (avoids closing on scroll).
 */
export function useSwipeToClose(
  direction: "left" | "right",
  onClose: () => void
) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart.current) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const deltaX = touch.clientX - touchStart.current.x;
      const deltaY = touch.clientY - touchStart.current.y;
      touchStart.current = null;

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX < MIN_SWIPE_PX || absX <= absY) return;

      if (direction === "right" && deltaX > 0) {
        onClose();
      } else if (direction === "left" && deltaX < 0) {
        onClose();
      }
    },
    [direction, onClose]
  );

  return { onTouchStart, onTouchEnd };
}