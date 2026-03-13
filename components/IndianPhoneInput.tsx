"use client";

import { useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  getIndianPhoneDigits,
  formatIndianPhoneDisplay,
  countDigitsBefore,
  positionAfterNDigits,
} from "@/lib/utils/validation";
import type { ComponentProps } from "react";

interface IndianPhoneInputProps extends Omit<ComponentProps<typeof Input>, "value" | "onChange"> {
  /** Digits only (no space), e.g. "9876543210" */
  value: string;
  /** Called with digits only when the user types or pastes */
  onChange: (digits: string) => void;
}

/**
 * Indian 10-digit phone input. Displays "98765 43210" (space after 5th digit)
 * and stores digits only, so backspace/delete behaves correctly.
 */
export default function IndianPhoneInput({
  value,
  onChange,
  ...inputProps
}: IndianPhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const nextCursorRef = useRef<number | null>(null);

  const formatted = formatIndianPhoneDisplay(value);

  useEffect(() => {
    if (inputRef.current && nextCursorRef.current !== null) {
      const pos = nextCursorRef.current;
      inputRef.current.setSelectionRange(pos, pos);
      nextCursorRef.current = null;
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const prevFormatted = formatIndianPhoneDisplay(value);
    const prevCursor = e.target.selectionStart ?? 0;
    const digitsBeforeCursor = countDigitsBefore(prevFormatted, prevCursor);
    const newDigits = getIndianPhoneDigits(e.target.value);
    onChange(newDigits);
    const newFormatted = formatIndianPhoneDisplay(newDigits);
    // When typing: cursor moves past the inserted digit(s). When deleting: cursor stays at min(digitsBefore, newLength).
    const digitCountChange = newDigits.length - value.length;
    const newCursorDigitIndex =
      digitCountChange > 0
        ? digitsBeforeCursor + digitCountChange
        : Math.min(digitsBeforeCursor, newDigits.length);
    nextCursorRef.current = positionAfterNDigits(
      newFormatted,
      Math.min(newCursorDigitIndex, newDigits.length)
    );
  };

  return (
    <Input
      ref={inputRef}
      type="tel"
      inputMode="numeric"
      autoComplete="tel"
      value={formatted}
      onChange={handleChange}
      placeholder="98765 43210"
      {...inputProps}
    />
  );
}
