"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { X, AlertCircle, Trash2, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PincodeCheckResult } from "@/lib/types/shipping";
import { getIndianPhoneDigits } from "@/lib/utils/validation";
import IndianPhoneInput from "@/components/IndianPhoneInput";

interface AddressData {
  address_type: "home" | "work" | "billing" | "shipping" | "other";
  label: string;
  full_name: string;
  phone: string;
  address_line_1: string;
  area: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
}

interface AddressValidationErrors {
  full_name: string;
  phone: string;
  address_line_1: string;
  area: string;
  city: string;
  state: string;
  postal_code: string;
}

/** API response shape: PincodeCheckResult plus display fields (city, state, country) returned by the route */
type PincodeCheckApiResponse = PincodeCheckResult & {
  area: string;
  city: string;
  state: string;
  country: string;
  address_hint?: string;
  error?: string;
};

interface AddressFormModalProps {
  isOpen: boolean;
  isEditing: boolean;
  isSaving: boolean;
  addressData: AddressData;
  validationErrors: AddressValidationErrors;
  addresses: any[]; // Array of user's addresses
  onClose: () => void;
  onSave: () => void;
  onInputChange: (field: string, value: string) => void;
  onDelete?: () => void;
  /** Enable pincode serviceability check. When true, pincode is validated and city/state/country are auto-filled. */
  enablePincodeCheck?: boolean;
  /** Profile phone number; when set, user can choose "Use my profile number" for the address phone field. */
  profilePhone?: string | null;
}

export default function AddressFormModal({
  isOpen,
  isEditing,
  isSaving,
  addressData,
  validationErrors,
  addresses,
  onClose,
  onSave,
  onInputChange,
  onDelete,
  enablePincodeCheck,
  profilePhone,
}: AddressFormModalProps) {
  const [pincodeStatus, setPincodeStatus] = useState<
    "idle" | "checking" | "serviceable" | "not_serviceable" | "error"
  >("idle");
  const [pincodeMessage, setPincodeMessage] = useState("");
  const [addressHint, setAddressHint] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pincodeAbortRef = useRef<AbortController | null>(null);

  // Clear any pending debounce timer when the modal unmounts
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      pincodeAbortRef.current?.abort();
      pincodeAbortRef.current = null;
    };
  }, []);

  // Reset pincode state when modal opens; abort any in-flight pincode request
  useEffect(() => {
    if (isOpen && enablePincodeCheck) {
      pincodeAbortRef.current?.abort();
      pincodeAbortRef.current = null;
      setPincodeStatus("idle");
      setPincodeMessage("");
      setAddressHint("");
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = undefined;
      }
    }
  }, [isOpen, enablePincodeCheck]);

  const checkPincode = useCallback(
    async (pincode: string) => {
      if (!enablePincodeCheck) return;
      if (!/^\d{6}$/.test(pincode)) {
        setPincodeStatus("idle");
        setPincodeMessage("");
        return;
      }

      pincodeAbortRef.current?.abort();
      const controller = new AbortController();
      pincodeAbortRef.current = controller;

      setPincodeStatus("checking");
      setPincodeMessage("");

      try {
        const res = await fetch(`/api/shipping/pincode-check?pincode=${pincode}`, {
          signal: controller.signal,
        });
        const clone = res.clone();
        let data: PincodeCheckApiResponse | null = null;
        try {
          data = await res.json();
        } catch {
          const text = await clone.text();
          throw new Error(`Pincode check failed (${res.status}): ${text || res.statusText}`);
        }

        if (!res.ok) {
          setPincodeStatus("error");
          setPincodeMessage(data?.error || "Unable to verify pincode");
          return;
        }

        if (data!.address_hint) setAddressHint(data!.address_hint);
        if (data!.serviceable) {
          setPincodeStatus("serviceable");
          setPincodeMessage(
            data!.area
              ? `Delivery available - ${data!.area}, ${data!.city}, ${data!.state}`
              : `Delivery available - ${data!.city}, ${data!.state}`
          );
          if (data!.area != null && data!.area !== "") {
            onInputChange("area", data!.area);
          }
          onInputChange("city", data!.city);
          onInputChange("state", data!.state);
          onInputChange("country", data!.country);
        } else {
          setPincodeStatus("not_serviceable");
          setPincodeMessage("Sorry, delivery is not available in this area");
          // Still set area/location (post office) when API returns it, so user sees the pincode's post office
          if (data!.area != null && data!.area !== "") {
            onInputChange("area", data!.area);
          }
          if (data!.city) onInputChange("city", data!.city);
          if (data!.state) onInputChange("state", data!.state);
          if (data!.country) onInputChange("country", data!.country);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setPincodeStatus("error");
        setPincodeMessage("Unable to verify pincode. Please try again.");
      } finally {
        if (pincodeAbortRef.current === controller) {
          pincodeAbortRef.current = null;
        }
      }
    },
    [enablePincodeCheck, onInputChange]
  );

  // When modal opens with an existing pincode (e.g. edit address), run pincode check once so delivery status and city/state/area show
  const prevIsOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;
    if (!isOpen || !enablePincodeCheck || !justOpened) return;
    const pincode = addressData.postal_code;
    if (pincode && /^\d{6}$/.test(pincode)) {
      checkPincode(pincode);
    }
  }, [
    isOpen,
    enablePincodeCheck,
    addressData.postal_code,
    checkPincode,
  ]);

  const handlePincodeChange = useCallback(
    (value: string) => {
      onInputChange("postal_code", value);
      if (enablePincodeCheck) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => checkPincode(value), 500);
      }
    },
    [enablePincodeCheck, onInputChange, checkPincode]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center md:p-4 z-50">
      <div className="bg-white rounded-t-2xl md:rounded-lg shadow-xl max-w-2xl w-full max-h-[92vh] md:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 md:p-6 border-b md:border-b-0 shrink-0">
          <h3 className="text-lg md:text-xl font-medium">
            {isEditing ? "Edit Address" : "Add New Address"}
          </h3>
          <Button variant="outline" size="icon" onClick={onClose} aria-label="Close address form">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:px-6 md:pb-2">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="address_type">Address Type</Label>
                <select
                  id="address_type"
                  value={addressData.address_type}
                  onChange={(e) =>
                    onInputChange("address_type", e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="home">Home</option>
                  <option value="work">Work</option>
                  <option value="billing">Billing</option>
                  <option value="shipping">Shipping</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <Label htmlFor="label">Label (Optional)</Label>
                <Input
                  id="label"
                  value={addressData.label}
                  onChange={(e) => onInputChange("label", e.target.value)}
                  placeholder="e.g., Mom's House, Office"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={addressData.full_name}
                  onChange={(e) => onInputChange("full_name", e.target.value)}
                  placeholder="Recipient name"
                  className={validationErrors.full_name ? "border-red-500" : ""}
                />
                {validationErrors.full_name && (
                  <div className="flex items-center mt-1 text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1 shrink-0" />
                    {validationErrors.full_name}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="phone">Phone Number *</Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 text-sm">+91</span>
                  </div>
                  <IndianPhoneInput
                    id="phone"
                    value={addressData.phone}
                    onChange={(digits) => onInputChange("phone", digits)}
                    className={`pl-12 ${validationErrors.phone ? "border-red-500" : ""}`}
                  />
                </div>
                {profilePhone != null && profilePhone !== "" && (
                  <button
                    type="button"
                    onClick={() =>
                      onInputChange("phone", getIndianPhoneDigits(profilePhone ?? ""))
                    }
                    className="mt-1.5 text-sm text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/20 rounded"
                  >
                    Use my profile number
                  </button>
                )}
                {validationErrors.phone && (
                  <div className="flex items-center mt-1 text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1 shrink-0" />
                    {validationErrors.phone}
                  </div>
                )}
              </div>
            </div>
            {/* PIN Code first when pincode check is enabled */}
            <div>
              <Label htmlFor="postal_code">PIN Code *</Label>
              <div className="relative">
                <Input
                  id="postal_code"
                  value={addressData.postal_code}
                  onChange={(e) => handlePincodeChange(e.target.value)}
                  placeholder="Enter 6-digit PIN code"
                  required
                  maxLength={6}
                  inputMode="numeric"
                  className={
                    validationErrors.postal_code
                      ? "border-red-500"
                      : pincodeStatus === "serviceable"
                        ? "border-green-500"
                        : pincodeStatus === "not_serviceable"
                          ? "border-red-500"
                          : ""
                  }
                />
                {pincodeStatus === "checking" && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {pincodeStatus === "serviceable" && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  </div>
                )}
                {pincodeStatus === "not_serviceable" && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <XCircle className="w-4 h-4 text-red-500" />
                  </div>
                )}
              </div>
              {validationErrors.postal_code && (
                <div className="flex items-center mt-1 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mr-1 shrink-0" />
                  {validationErrors.postal_code}
                </div>
              )}
              {pincodeMessage && (
                <div
                  className={`flex items-center mt-1 text-sm ${pincodeStatus === "serviceable"
                    ? "text-green-600"
                    : "text-red-600"
                    }`}
                >
                  {pincodeStatus === "serviceable" ? (
                    <CheckCircle className="w-4 h-4 mr-1 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 mr-1 shrink-0" />
                  )}
                  {pincodeMessage}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={addressData.country}
                  onChange={(e) => onInputChange("country", e.target.value)}
                  placeholder="Country"
                  disabled={enablePincodeCheck && pincodeStatus === "serviceable"}
                  className={
                    enablePincodeCheck && pincodeStatus === "serviceable" ? "bg-muted/50 cursor-not-allowed opacity-75" : ""
                  }
                />
              </div>
              <div>
                <Label htmlFor="state">State *</Label>
                <Input
                  id="state"
                  value={addressData.state}
                  onChange={(e) => onInputChange("state", e.target.value)}
                  placeholder="State"
                  required
                  disabled={enablePincodeCheck && pincodeStatus === "serviceable"}
                  className={`${validationErrors.state ? "border-red-500" : ""} ${enablePincodeCheck && pincodeStatus === "serviceable" ? "bg-muted/50 cursor-not-allowed opacity-75" : ""
                    }`}
                />
                {validationErrors.state && (
                  <div className="flex items-center mt-1 text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1 shrink-0" />
                    {validationErrors.state}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={addressData.city}
                  onChange={(e) => onInputChange("city", e.target.value)}
                  placeholder="City"
                  required
                  disabled={enablePincodeCheck && pincodeStatus === "serviceable"}
                  className={`${validationErrors.city ? "border-red-500" : ""} ${enablePincodeCheck && pincodeStatus === "serviceable" ? "bg-muted/50 cursor-not-allowed opacity-75" : ""
                    }`}
                />
                {validationErrors.city && (
                  <div className="flex items-center mt-1 text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1 shrink-0" />
                    {validationErrors.city}
                  </div>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="area">Area / Locality</Label>
              <Input
                id="area"
                value={addressData.area}
                onChange={(e) => onInputChange("area", e.target.value)}
                placeholder="Area, locality or post office (auto-filled from PIN)"
                disabled={enablePincodeCheck && pincodeStatus === "serviceable"}
                className={
                  enablePincodeCheck && pincodeStatus === "serviceable"
                    ? "bg-muted/50 cursor-not-allowed opacity-75"
                    : ""
                }
              />
            </div>

            {enablePincodeCheck && (pincodeStatus === "serviceable" || pincodeStatus === "not_serviceable") && (
              <p className="text-sm text-muted-foreground -mt-1">
                {addressHint || "Include building name, street name, house/flat no., floor and landmark for accurate delivery."}
              </p>
            )}

            <div>
              <Label htmlFor="address_line_1">Building / Street address *</Label>
              <Input
                id="address_line_1"
                value={addressData.address_line_1}
                onChange={(e) =>
                  onInputChange("address_line_1", e.target.value)
                }
                placeholder="Building name, house/flat no., street name"
                required
                className={
                  validationErrors.address_line_1 ? "border-red-500" : ""
                }
              />
              {validationErrors.address_line_1 && (
                <div className="flex items-center mt-1 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mr-1 shrink-0" />
                  {validationErrors.address_line_1}
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_default"
                checked={addressData.is_default}
                disabled={addresses.length === 1}
                onChange={(e) =>
                  onInputChange("is_default", e.target.checked.toString())
                }
                className={`rounded border-gray-300 ${addresses.length === 1 ? "opacity-50 cursor-not-allowed" : ""
                  }`}
              />
              <Label
                htmlFor="is_default"
                className={addresses.length === 1 ? "opacity-50" : ""}
              >
                Set as default address
                {addresses.length === 1 && (
                  <span className="text-xs text-gray-500 ml-1">
                    (Only address - automatically default)
                  </span>
                )}
              </Label>
            </div>
          </div>
        </div>

        <div className="border-t p-4 md:px-6 md:pb-6 shrink-0 space-y-3 md:space-y-0">
          {/* Mobile: stacked buttons */}
          <div className="flex flex-col-reverse md:flex-row md:justify-between gap-3">
            {/* Delete Button - Only show when editing */}
            {isEditing && onDelete && (
              <Button
                variant="outline"
                onClick={onDelete}
                className="w-full md:w-auto text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Address
              </Button>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col md:flex-row gap-3 md:ml-auto">
              <Button
                onClick={onSave}
                disabled={
                  isSaving ||
                  (!isEditing && !addressData.phone) ||
                  !addressData.address_line_1 ||
                  !addressData.city ||
                  !addressData.state ||
                  !addressData.postal_code ||
                  !!validationErrors.full_name ||
                  !!validationErrors.phone ||
                  !!validationErrors.address_line_1 ||
                  !!validationErrors.city ||
                  !!validationErrors.state ||
                  !!validationErrors.postal_code ||
                  (enablePincodeCheck && pincodeStatus !== "serviceable")
                }
                className="w-full md:w-auto"
              >
                {isSaving
                  ? "Saving..."
                  : isEditing
                    ? "Update Address"
                    : "Add Address"}
              </Button>
              <Button variant="outline" onClick={onClose} className="w-full md:w-auto">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
