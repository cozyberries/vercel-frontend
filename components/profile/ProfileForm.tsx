"use client";

import { useState } from "react";
import {
  User,
  Phone,
  Edit3,
  Save,
  X,
  AlertCircle,
  MapPin,
  Plus,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validatePhoneNumber, validateFullName } from "@/lib/utils/validation";
import AddressCard from "./AddressCard";

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  updated_at: string;
}

interface UserAddress {
  id: string;
  user_id: string;
  address_type: string;
  label: string | null;
  full_name: string | null;
  phone: string | null;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ProfileFormProps {
  profile: UserProfile | null;
  isEditing: boolean;
  isSaving: boolean;
  validationErrors: {
    full_name: string;
    phone: string;
  };
  editData: {
    full_name: string;
    phone: string;
  };
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onInputChange: (field: string, value: string) => void;
  addresses: UserAddress[];
  onAddAddress: () => void;
  onEditAddress: (address: UserAddress) => void;
  onSetDefault: (id: string) => void;
  onSignOut: () => void;
}

export default function ProfileForm({
  profile,
  isEditing,
  isSaving,
  validationErrors,
  editData,
  onEdit,
  onSave,
  onCancel,
  onInputChange,
  addresses,
  onAddAddress,
  onEditAddress,
  onSetDefault,
  onSignOut,
}: ProfileFormProps) {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-3">
          <User className="w-6 h-6 text-primary" />
          <h3 className="text-xl font-light">Personal Information</h3>
        </div>
        <div className="flex items-center space-x-2">
          {!isEditing ? (
            <Button onClick={onEdit} size="icon" variant="outline">
              <Edit3 className="w-4 h-4" />
            </Button>
          ) : (
            <div className="flex space-x-2">
              <Button
                onClick={onSave}
                disabled={
                  isSaving ||
                  !!validationErrors.full_name ||
                  !!validationErrors.phone
                }
                size="icon"
                variant="outline"
              >
                <Save className="w-4 h-4" />
              </Button>
              <Button variant="outline" onClick={onCancel} size="icon">
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Basic Information Section */}
      <div className="mb-8">
        {isEditing ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center space-x-2 mb-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  Name
                </span>
              </div>
              <Input
                id="full_name"
                value={editData.full_name}
                onChange={(e) => onInputChange("full_name", e.target.value)}
                placeholder="Enter your full name"
                className={`w-full h-11 ${
                  validationErrors.full_name
                    ? "border-red-500 focus:border-red-500"
                    : ""
                }`}
              />
              {validationErrors.full_name && (
                <div className="flex items-center mt-1 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {validationErrors.full_name}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2 mb-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  Phone
                </span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-muted-foreground text-sm font-medium">
                    +91
                  </span>
                </div>
                <Input
                  id="phone"
                  value={editData.phone}
                  onChange={(e) => onInputChange("phone", e.target.value)}
                  placeholder="98765 43210"
                  className={`w-full h-11 pl-12 ${
                    validationErrors.phone
                      ? "border-red-500 focus:border-red-500"
                      : ""
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
        ) : (
          <div className="space-y-4">
            <div className="flex items-center space-x-4 p-4 bg-muted/30 rounded-lg">
              <User className="w-5 h-5 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-base font-medium text-foreground">
                  {profile?.full_name || "Not provided"}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4 p-4 bg-muted/30 rounded-lg">
              <Phone className="w-5 h-5 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-base font-medium text-foreground">
                  {profile?.phone ? `+91 ${profile.phone}` : "Not provided"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Addresses Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <MapPin className="w-5 h-5 text-primary" />
            <h3 className="text-xl font-light">Addresses</h3>
          </div>
          <Button onClick={onAddAddress} size="icon" variant="outline">
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {addresses.length === 0 ? (
            <div className="text-center py-8 px-4">
              <div className="w-12 h-12 mx-auto mb-4 bg-muted/30 rounded-full flex items-center justify-center">
                <MapPin className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground mb-2 font-medium text-sm">
                No addresses added yet
              </p>
              <p className="text-xs text-muted-foreground">
                Click the + button to create your first address
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {addresses.map((address) => (
                <AddressCard
                  key={address.id}
                  address={address}
                  onEditAddress={onEditAddress}
                  onSetDefault={onSetDefault}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Logout Button - appears at bottom for mobile */}
      <div className="mt-8 pt-6 border-t border-border">
        <Button
          variant="outline"
          onClick={onSignOut}
          className=" lg:w-fit w-full"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>
    </div>
  );
}
