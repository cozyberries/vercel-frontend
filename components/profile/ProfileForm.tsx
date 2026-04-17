"use client";

import { useState } from "react";
import {
  User,
  Phone,
  Mail,
  Edit3,
  Check,
  X,
  AlertCircle,
  MapPin,
  Plus,
  LogOut,
  Loader2,
  UserPlus,
  ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validatePhoneNumber, validateFullName, formatIndianPhoneDisplay } from "@/lib/utils/validation";
import { isPlaceholderEmail } from "@/lib/utils/auth";
import IndianPhoneInput from "@/components/IndianPhoneInput";
import AddressCard from "./AddressCard";
import { useAuth } from "@/components/supabase-auth-provider";
import UserPickerModal from "@/components/admin/UserPickerModal";

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
  area: string | null;
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
    email: string;
  };
  editData: {
    full_name: string;
    phone: string;
    email: string;
  };
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onInputChange: (field: string, value: string) => void;
  addresses: UserAddress[];
  onAddAddress: () => void;
  onEditAddress: (address: UserAddress) => void;
  onSetDefault: (id: string) => void;
  onDeleteAddress: (id: string) => void;
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
  onDeleteAddress,
  onSignOut,
}: ProfileFormProps) {
  const { isAdmin } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 lg:p-8">
      {/* Basic Information: name + contact row with inline Edit / Save / Clear */}
      <div className="mb-8">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-1 min-w-0 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-muted-foreground">Name</span>
            </div>
            {isEditing ? (
              <>
                <Input
                  id="full_name"
                  value={editData.full_name}
                  onChange={(e) => onInputChange("full_name", e.target.value)}
                  placeholder="Enter your full name"
                  disabled={isSaving}
                  className={`w-full h-11 ${validationErrors.full_name ? "border-red-500 focus:border-red-500" : ""}`}
                />
                {validationErrors.full_name && (
                  <div className="flex items-center mt-1 text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {validationErrors.full_name}
                  </div>
                )}
              </>
            ) : (
              <p className="text-base font-normal text-foreground">
                {profile?.full_name || "Not provided"}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-muted-foreground">Phone</span>
            </div>
            {isEditing ? (
              <>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-base md:text-sm font-normal text-muted-foreground">+91</span>
                  </div>
                  <IndianPhoneInput
                    id="phone"
                    value={editData.phone}
                    onChange={(digits) => onInputChange("phone", digits)}
                    placeholder="98765 43210"
                    disabled={isSaving}
                    className={`w-full h-11 pl-12 ${validationErrors.phone ? "border-red-500 focus:border-red-500" : ""}`}
                  />
                </div>
                {validationErrors.phone && (
                  <div className="flex items-center mt-1 text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {validationErrors.phone}
                  </div>
                )}
              </>
            ) : (
              <p className="text-base font-normal text-foreground">
                {profile?.phone ? `+91 ${formatIndianPhoneDisplay(profile.phone)}` : "Not provided"}
              </p>
            )}
          </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isEditing ? (
              <Button onClick={onEdit} size="icon" variant="outline" className="size-10" aria-label="Edit profile">
                <Edit3 className="w-4 h-4" />
              </Button>
            ) : (
              <>
                <Button
                  onClick={onSave}
                  disabled={isSaving || !!validationErrors.full_name || !!validationErrors.phone}
                  size="icon"
                  variant="outline"
                  className="size-10"
                  aria-label={isSaving ? "Saving..." : "Save changes"}
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </Button>
                {!isSaving && (
                  <Button variant="outline" onClick={onCancel} size="icon" className="size-10" aria-label="Cancel editing">
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Email — read-only when not editing, editable when editing */}
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-muted-foreground">Email</span>
            <span className="text-xs text-muted-foreground">(optional)</span>
          </div>
          {isEditing ? (
            <>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={editData.email}
                onChange={(e) => onInputChange("email", e.target.value)}
                disabled={isSaving}
                className={`w-full h-11 ${validationErrors.email ? "border-red-500 focus:border-red-500" : ""}`}
              />
              {validationErrors.email && (
                <div className="flex items-center text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mr-1 shrink-0" />
                  {validationErrors.email}
                </div>
              )}
              {!validationErrors.email && (
                <p className="text-xs text-muted-foreground">
                  Your email will be updated immediately.
                </p>
              )}
            </>
          ) : (
            <p className="text-base font-normal text-foreground">
              {isPlaceholderEmail(profile?.email) ? "Not provided" : (profile?.email || "Not provided")}
            </p>
          )}
        </div>

      </div>

      {/* Addresses Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <MapPin className="w-5 h-5 text-primary" />
            <h3 className="text-xl font-light">Addresses</h3>
          </div>
          <Button onClick={onAddAddress} size="icon" variant="outline" className="size-10 shrink-0" aria-label="Add new address">
            <Plus className="w-4 h-4" />
          </Button>        </div>

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
                  onDeleteAddress={onDeleteAddress}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="mt-8 pt-6 border-t border-border space-y-2">
          <h3 className="text-sm font-semibold text-foreground mb-3">Admin</h3>
          <Button
            variant="outline"
            onClick={() => setPickerOpen(true)}
            className="w-full"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Place order on behalf
          </Button>
          <Button variant="outline" asChild className="w-full">
            <Link href="/admin/on-behalf-orders">
              <ClipboardList className="w-4 h-4 mr-2" />
              On-behalf orders
            </Link>
          </Button>
        </div>
      )}

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

      {isAdmin && (
        <UserPickerModal open={pickerOpen} onOpenChange={setPickerOpen} />
      )}
    </div>
  );
}
