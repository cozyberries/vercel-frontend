"use client";

import { useRef } from "react";
import { Home, Store } from "lucide-react";
import type { FulfilmentMethod } from "@/lib/types/order";

const OPTIONS = [
  { value: "delivery", label: "Home delivery", hint: "Delivered by courier", Icon: Home },
  { value: "pickup", label: "Pick up from our stall", hint: "Free · no address needed", Icon: Store },
] as const;

export function FulfilmentPicker({
  value,
  onChange,
}: {
  value: FulfilmentMethod;
  onChange: (method: FulfilmentMethod) => void;
}) {
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const moveTo = (nextIndex: number) => {
    const wrapped = (nextIndex + OPTIONS.length) % OPTIONS.length;
    onChange(OPTIONS[wrapped].value);
    optionRefs.current[wrapped]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="How would you like to get your order?" className="grid grid-cols-2 gap-3">
      {OPTIONS.map(({ value: option, label, hint, Icon }, index) => {
        const selected = option === value;
        return (
          <button
            key={option}
            ref={(el) => {
              optionRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option)}
            onKeyDown={(e) => {
              switch (e.key) {
                case "ArrowRight":
                case "ArrowDown":
                  e.preventDefault();
                  moveTo(index + 1);
                  break;
                case "ArrowLeft":
                case "ArrowUp":
                  e.preventDefault();
                  moveTo(index - 1);
                  break;
                default:
                  break;
              }
            }}
            className={`rounded-2xl border p-4 text-left ${
              selected ? "border-cb-terracotta bg-cb-peach/40" : "border-cb-border bg-white"
            }`}
          >
            <Icon className="h-4 w-4 text-cb-terracotta-deep mb-2" aria-hidden />
            <span className="block text-sm font-bold text-cb-fg">{label}</span>
            <span className="block text-xs text-cb-muted-fg">{hint}</span>
          </button>
        );
      })}
    </div>
  );
}
