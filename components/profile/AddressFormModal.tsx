"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { X, AlertCircle, Loader2, CheckCircle, XCircle, Home, Briefcase, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PincodeCheckResult } from "@/lib/types/shipping";
import { getIndianPhoneDigits, formatIndianPhoneDisplay } from "@/lib/utils/validation";

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
  /** Profile phone/name; when set, "Use my name & number" can prefill the address recipient fields. */
  profilePhone?: string | null;
  profileFullName?: string | null;
}

const TYPE_OPTIONS: { value: AddressData["address_type"]; label: string; icon: typeof Home }[] = [
  { value: "home", label: "Home", icon: Home },
  { value: "work", label: "Work", icon: Briefcase },
  { value: "other", label: "Other", icon: MapPin },
];

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
  enablePincodeCheck,
  profilePhone,
  profileFullName,
}: AddressFormModalProps) {
  const [pincodeStatus, setPincodeStatus] = useState<
    "idle" | "checking" | "serviceable" | "not_serviceable" | "error"
  >("idle");
  const [pincodeMessage, setPincodeMessage] = useState("");
  const [useMyInfo, setUseMyInfo] = useState(!isEditing);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pincodeAbortRef = useRef<AbortController | null>(null);

  // Reset "use my info" default whenever the modal opens (checked for a fresh
  // add, unchecked for edit since the address may belong to someone else).
  useEffect(() => {
    if (!isOpen) return;
    setUseMyInfo(!isEditing);
  }, [isOpen, isEditing]);

  // When "use my info" is on, force the recipient fields to the profile's
  // name/phone so Save always submits consistent data even if the user
  // never touches those (disabled) inputs.
  useEffect(() => {
    if (!isOpen || !useMyInfo) return;
    if (profileFullName) onInputChange("full_name", profileFullName);
    if (profilePhone) onInputChange("phone", getIndianPhoneDigits(profilePhone));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, useMyInfo, profileFullName, profilePhone]);

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

        if (data!.serviceable) {
          setPincodeStatus("serviceable");
          setPincodeMessage(
            data!.area
              ? `Delivery available - ${data!.area}, ${data!.city}, ${data!.state}`
              : `Delivery available - ${data!.city}, ${data!.state}`
          );
        } else {
          setPincodeStatus("not_serviceable");
          setPincodeMessage("Sorry, delivery is not available in this area");
        }
        // Always capture area/city/state/country when the API returns them —
        // state/country aren't shown as fields but are still required to save.
        if (data!.area != null && data!.area !== "") onInputChange("area", data!.area);
        if (data!.city) onInputChange("city", data!.city);
        if (data!.state) onInputChange("state", data!.state);
        if (data!.country) onInputChange("country", data!.country);
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
      const digits = value.replace(/\D/g, "").slice(0, 6);
      onInputChange("postal_code", digits);
      if (enablePincodeCheck) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => checkPincode(digits), 500);
      }
    },
    [enablePincodeCheck, onInputChange, checkPincode]
  );

  if (!isOpen) return null;

  const isOnlyAddress =
    (!isEditing && addresses.length === 0) ||
    (isEditing && addresses.length === 1);

  const pincodeChecked = enablePincodeCheck
    ? pincodeStatus === "serviceable" || pincodeStatus === "not_serviceable" || pincodeStatus === "error"
    : !!addressData.postal_code;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center md:p-4 z-50">
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-md w-full max-h-[92vh] md:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 shrink-0">
          <h3 className="text-lg font-bold text-cb-fg">
            {isEditing ? "Edit address" : "Add new address"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-cb-fg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map(({ value, label, icon: TypeIcon }) => {
                const selected = addressData.address_type === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onInputChange("address_type", value)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 text-sm font-semibold ${
                      selected
                        ? "border-cb-terracotta bg-cb-peach text-cb-terracotta-deep"
                        : "border-cb-border text-cb-fg"
                    }`}
                  >
                    <TypeIcon className="h-4 w-4" />
                    {label}
                  </button>
                );
              })}
            </div>

            {addressData.address_type === "other" && (
              <div>
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  value={addressData.label}
                  onChange={(e) => onInputChange("label", e.target.value)}
                  placeholder="e.g. Mom's place, Gym, Office 2"
                  className="mt-1 h-12 rounded-xl"
                />
              </div>
            )}

            <div>
              <Label htmlFor="postal_code">Pincode</Label>
              <div className="relative mt-1">
                <Input
                  id="postal_code"
                  value={addressData.postal_code}
                  onChange={(e) => handlePincodeChange(e.target.value)}
                  placeholder="Enter 6-digit pincode"
                  required
                  maxLength={6}
                  inputMode="numeric"
                  className={`h-12 rounded-xl pr-9 ${
                    validationErrors.postal_code
                      ? "border-red-500"
                      : pincodeStatus === "serviceable"
                        ? "border-green-500"
                        : pincodeStatus === "not_serviceable"
                          ? "border-red-500"
                          : ""
                  }`}
                />
                {pincodeStatus === "checking" && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-cb-muted-fg" />
                )}
                {pincodeStatus === "serviceable" && (
                  <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                )}
                {pincodeStatus === "not_serviceable" && (
                  <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
                )}
              </div>
              {validationErrors.postal_code ? (
                <div className="flex items-center mt-1 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mr-1 shrink-0" />
                  {validationErrors.postal_code}
                </div>
              ) : pincodeMessage ? (
                <p className={`mt-1 text-sm ${pincodeStatus === "serviceable" ? "text-green-600" : "text-red-600"}`}>
                  {pincodeMessage}
                </p>
              ) : (
                <p className="mt-1 text-sm text-cb-muted-fg">
                  Enter your pincode — we&apos;ll auto-fill your area &amp; city.
                </p>
              )}
            </div>

            {pincodeChecked && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="area">Area / Locality</Label>
                    <Input
                      id="area"
                      value={addressData.area}
                      onChange={(e) => onInputChange("area", e.target.value)}
                      placeholder="Enter your area / locality"
                      className="mt-1 h-12 rounded-xl"
                    />
                  </div>
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={addressData.city}
                      onChange={(e) => onInputChange("city", e.target.value)}
                      placeholder="Enter your city"
                      className={`mt-1 h-12 rounded-xl ${validationErrors.city ? "border-red-500" : ""}`}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="address_line_1">Flat / House no., Street</Label>
                  <Input
                    id="address_line_1"
                    value={addressData.address_line_1}
                    onChange={(e) => onInputChange("address_line_1", e.target.value)}
                    placeholder="Enter flat / house no. and street"
                    className={`mt-1 h-12 rounded-xl ${validationErrors.address_line_1 ? "border-red-500" : ""}`}
                  />
                  {validationErrors.address_line_1 && (
                    <div className="flex items-center mt-1 text-sm text-red-600">
                      <AlertCircle className="w-4 h-4 mr-1 shrink-0" />
                      {validationErrors.address_line_1}
                    </div>
                  )}
                </div>

                {(profileFullName || profilePhone) && (
                  <button
                    type="button"
                    onClick={() => setUseMyInfo((v) => !v)}
                    className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left ${
                      useMyInfo ? "border-cb-terracotta bg-cb-peach" : "border-cb-border"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                        useMyInfo ? "border-cb-terracotta bg-cb-terracotta text-white" : "border-cb-border text-transparent"
                      }`}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-cb-fg">Use my name &amp; number</span>
                      <span className="block text-xs text-cb-muted-fg">
                        {profileFullName || "—"} · +91 {formatIndianPhoneDisplay(getIndianPhoneDigits(profilePhone ?? ""))}
                      </span>
                    </span>
                  </button>
                )}

                <div>
                  <Label htmlFor="full_name">Full name</Label>
                  <Input
                    id="full_name"
                    value={addressData.full_name}
                    onChange={(e) => onInputChange("full_name", e.target.value)}
                    placeholder="Recipient name"
                    disabled={useMyInfo}
                    className={`mt-1 h-12 rounded-xl ${useMyInfo ? "bg-cb-muted opacity-75" : ""} ${validationErrors.full_name ? "border-red-500" : ""}`}
                  />
                  {validationErrors.full_name && (
                    <div className="flex items-center mt-1 text-sm text-red-600">
                      <AlertCircle className="w-4 h-4 mr-1 shrink-0" />
                      {validationErrors.full_name}
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <div
                    className={`mt-1 flex h-12 items-center overflow-hidden rounded-xl border ${
                      validationErrors.phone ? "border-red-500" : "border-transparent"
                    } ${useMyInfo ? "bg-cb-muted opacity-75" : "bg-white"}`}
                  >
                    <span className="flex h-full shrink-0 items-center border-r border-cb-border px-3 text-sm font-bold text-cb-fg">
                      +91
                    </span>
                    <Input
                      id="phone"
                      value={formatIndianPhoneDisplay(addressData.phone)}
                      onChange={(e) => onInputChange("phone", getIndianPhoneDigits(e.target.value))}
                      placeholder="98765 43210"
                      disabled={useMyInfo}
                      className="h-full flex-1 rounded-none border-none bg-transparent shadow-none focus-visible:ring-0"
                    />
                  </div>
                  {validationErrors.phone && (
                    <div className="flex items-center mt-1 text-sm text-red-600">
                      <AlertCircle className="w-4 h-4 mr-1 shrink-0" />
                      {validationErrors.phone}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_default"
                checked={addressData.is_default}
                disabled={isOnlyAddress}
                onChange={(e) => onInputChange("is_default", e.target.checked.toString())}
                className={`h-4 w-4 rounded border-cb-border ${isOnlyAddress ? "opacity-50 cursor-not-allowed" : ""}`}
              />
              <Label htmlFor="is_default" className={isOnlyAddress ? "opacity-50" : ""}>
                Set as default address
                {isOnlyAddress && (
                  <span className="text-xs text-cb-muted-fg ml-1">(Only address – automatically default)</span>
                )}
              </Label>
            </div>
          </div>
        </div>

        <div className="p-5 shrink-0">
          <Button
            onClick={onSave}
            disabled={
              isSaving ||
              !pincodeChecked ||
              (enablePincodeCheck && pincodeStatus !== "serviceable") ||
              !addressData.phone ||
              !addressData.address_line_1 ||
              !addressData.city ||
              !addressData.state ||
              !addressData.postal_code ||
              !!validationErrors.full_name ||
              !!validationErrors.phone ||
              !!validationErrors.address_line_1 ||
              !!validationErrors.city ||
              !!validationErrors.state ||
              !!validationErrors.postal_code
            }
            className="w-full h-12 rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white font-semibold"
          >
            {isSaving ? "Saving..." : "Save address"}
          </Button>
        </div>
      </div>
    </div>
  );
}
