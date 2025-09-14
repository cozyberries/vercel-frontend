"use client";

import { X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddressData {
  address_type: "home" | "work" | "billing" | "shipping" | "other";
  label: string;
  full_name: string;
  phone: string;
  address_line_1: string;
  address_line_2: string;
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
  city: string;
  state: string;
  postal_code: string;
}

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
}: AddressFormModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-medium">
              {isEditing ? "Edit Address" : "Add New Address"}
            </h3>
            <Button variant="outline" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={addressData.full_name}
                  onChange={(e) =>
                    onInputChange("full_name", e.target.value)
                  }
                  placeholder="Recipient name"
                  className={
                    validationErrors.full_name ? "border-red-500" : ""
                  }
                />
                {validationErrors.full_name && (
                  <div className="flex items-center mt-1 text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {validationErrors.full_name}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 text-sm">+91</span>
                  </div>
                  <Input
                    id="phone"
                    value={addressData.phone}
                    onChange={(e) => onInputChange("phone", e.target.value)}
                    placeholder="98765 43210"
                    className={`pl-12 ${
                      validationErrors.phone ? "border-red-500" : ""
                    }`}
                  />
                </div>
                {validationErrors.phone && (
                  <div className="flex items-center mt-1 text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {validationErrors.phone}
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="address_line_1">Address Line 1 *</Label>
              <Input
                id="address_line_1"
                value={addressData.address_line_1}
                onChange={(e) =>
                  onInputChange("address_line_1", e.target.value)
                }
                placeholder="Street address"
                required
                className={
                  validationErrors.address_line_1 ? "border-red-500" : ""
                }
              />
              {validationErrors.address_line_1 && (
                <div className="flex items-center mt-1 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {validationErrors.address_line_1}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="address_line_2">Address Line 2</Label>
              <Input
                id="address_line_2"
                value={addressData.address_line_2}
                onChange={(e) =>
                  onInputChange("address_line_2", e.target.value)
                }
                placeholder="Apartment, suite, etc."
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={addressData.city}
                  onChange={(e) => onInputChange("city", e.target.value)}
                  placeholder="City"
                  required
                  className={
                    validationErrors.city ? "border-red-500" : ""
                  }
                />
                {validationErrors.city && (
                  <div className="flex items-center mt-1 text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {validationErrors.city}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="state">State *</Label>
                <Input
                  id="state"
                  value={addressData.state}
                  onChange={(e) => onInputChange("state", e.target.value)}
                  placeholder="State"
                  required
                  className={
                    validationErrors.state ? "border-red-500" : ""
                  }
                />
                {validationErrors.state && (
                  <div className="flex items-center mt-1 text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {validationErrors.state}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="postal_code">PIN Code *</Label>
                <Input
                  id="postal_code"
                  value={addressData.postal_code}
                  onChange={(e) =>
                    onInputChange("postal_code", e.target.value)
                  }
                  placeholder="PIN Code (6 digits)"
                  required
                  className={
                    validationErrors.postal_code ? "border-red-500" : ""
                  }
                />
                {validationErrors.postal_code && (
                  <div className="flex items-center mt-1 text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {validationErrors.postal_code}
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={addressData.country}
                onChange={(e) => onInputChange("country", e.target.value)}
                placeholder="Country"
              />
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
                className={`rounded border-gray-300 ${
                  addresses.length === 1 ? "opacity-50 cursor-not-allowed" : ""
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

          <div className="flex justify-end space-x-3 mt-6">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={onSave}
              disabled={
                isSaving ||
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
            >
              {isSaving
                ? "Saving..."
                : isEditing
                ? "Update Address"
                : "Add Address"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
