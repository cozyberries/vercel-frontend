"use client";

import { useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  validateRequiredPhoneNumber,
  getIndianPhoneDigits,
  formatIndianPhoneDisplay,
  countDigitsBefore,
  positionAfterNDigits,
} from "@/lib/utils/validation";

interface PhoneInputProps {
  /** Digits only (no space) */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  onErrorChange?: (error: string) => void;
  required?: boolean;
  id?: string;
  label?: string;
}

export default function PhoneInput({
  value,
  onChange,
  error = "",
  onErrorChange,
  required = true,
  id = "phone",
  label = "Phone Number",
}: PhoneInputProps) {
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
    const prevCursor = e.target.selectionStart ?? 0;
    const digitsBeforeCursor = countDigitsBefore(e.target.value, prevCursor);    
    const newDigits = getIndianPhoneDigits(e.target.value);
    onChange(newDigits);
    if (error && onErrorChange) onErrorChange("");
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

  const handleBlur = () => {
    if (!onErrorChange) return;

    if (value) {
      const result = validateRequiredPhoneNumber(value);
      if (!result.isValid) {
        onErrorChange(result.error || "Invalid phone number");
      } else if (error) {
        onErrorChange("");
      }
    } else if (required) {
      onErrorChange("Phone number is required");
    } else if (error) {
      onErrorChange("");
    }
  };

  return (
    <div>
      <Label htmlFor={id}>{label} {required && "*"}</Label>
      <div
        className={`mt-1 flex h-12 items-center overflow-hidden rounded-xl border bg-white ${error ? "border-red-500" : "border-transparent"}`}
      >
        <span className="flex h-full shrink-0 items-center border-r border-cb-border px-3 text-sm font-bold text-cb-fg">
          +91
        </span>
        <Input
          ref={inputRef}
          id={id}
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required={required}
          value={formatted}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="Enter your mobile number"
          className="h-full flex-1 rounded-none border-none shadow-none focus-visible:ring-0"
        />
      </div>
      {error && (
        <div className="text-red-600 text-sm mt-1">{error}</div>
      )}
    </div>
  );
}
