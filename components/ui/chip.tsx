import { forwardRef, type ButtonHTMLAttributes } from "react";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  ({ active, className = "", ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "bg-cb-terracotta text-white"
          : "bg-white text-cb-fg border border-cb-border hover:border-cb-terracotta"
      } ${className}`}
      {...props}
    />
  )
);
Chip.displayName = "Chip";

export { Chip };
