"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateRequiredPhoneNumber } from "@/lib/utils/validation";

interface PhoneInputProps {
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
          id={id}
          name="phone"
          type="tel"
          autoComplete="tel"
          required={required}
          value={value}
          onChange={(e) => {
            const sanitized = e.target.value.replace(/[^0-9]/g, "");
            onChange(sanitized);
            if (error && onErrorChange) onErrorChange("");
          }}
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
