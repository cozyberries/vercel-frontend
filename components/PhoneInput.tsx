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
}

export default function PhoneInput({
  value,
  onChange,
  error = "",
  onErrorChange,
  required = true,
  id = "phone",
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
      <Label htmlFor={id}>Phone Number {required && "*"}</Label>
      <div className="relative mt-1">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <span className="text-gray-500 text-sm">+91</span>
        </div>
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
          placeholder="98765 43210"
          className={`pl-12 ${error ? "border-red-500" : ""}`}
        />
      </div>
      {error && (
        <div className="text-red-600 text-sm mt-1">{error}</div>
      )}
    </div>
  );
}
