"use client";

import { useState } from "react";
import { Home, Briefcase, MapPin, Phone, Check, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

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

interface AddressCardProps {
  address: UserAddress;
  onEditAddress: (address: UserAddress) => void;
  onSetDefault: (id: string) => void;
  onDeleteAddress: (id: string) => void;
}

const TYPE_ICON: Record<string, typeof Home> = {
  home: Home,
  work: Briefcase,
};

export default function AddressCard({
  address,
  onEditAddress,
  onSetDefault,
  onDeleteAddress,
}: AddressCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const Icon = TYPE_ICON[address.address_type] ?? MapPin;
  const typeLabel = address.label?.trim() || (address.address_type === "home" ? "Home" : address.address_type === "work" ? "Work" : "Other");

  return (
    <div
      className={`rounded-2xl border bg-white p-4 ${address.is_default ? "border-cb-terracotta" : "border-cb-border"}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cb-peach text-cb-terracotta-deep">
          <Icon className="h-4 w-4" />
        </span>
        <span className="font-bold text-cb-fg">{typeLabel}</span>
        {address.is_default && (
          <span className="rounded-full bg-cb-peach px-2.5 py-1 text-[11px] font-bold text-cb-terracotta-deep">
            Default
          </span>
        )}
      </div>

      <div className="space-y-0.5">
        {address.full_name && (
          <p className="font-bold text-cb-fg text-[15px]">{address.full_name}</p>
        )}
        <p className="text-sm text-cb-muted-fg">
          {[address.address_line_1, address.area].filter(Boolean).join(", ")}
        </p>
        <p className="text-sm text-cb-muted-fg">
          {address.city} – {address.postal_code}
        </p>
        {address.phone && (
          <p className="flex items-center gap-1.5 text-sm text-cb-muted-fg pt-1">
            <Phone className="h-3.5 w-3.5" />
            +91 {address.phone}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-cb-border pt-3">
        <div className="flex items-center gap-4">
          {!address.is_default && (
            <button
              type="button"
              onClick={() => onSetDefault(address.id)}
              className="flex items-center gap-1 text-sm font-semibold text-cb-terracotta-deep hover:underline"
            >
              <Check className="h-3.5 w-3.5" />
              Set default
            </button>
          )}
          <button
            type="button"
            onClick={() => onEditAddress(address)}
            className="flex items-center gap-1 text-sm font-semibold text-cb-fg hover:underline"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={address.is_default}
          title={address.is_default ? "Set another address as default before removing this one" : undefined}
          className={`flex items-center gap-1 text-sm font-semibold ${
            address.is_default
              ? "text-cb-muted-fg opacity-50 cursor-not-allowed"
              : "text-cb-muted-fg hover:text-cb-destructive"
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="mt-3 p-3 bg-cb-linen border border-cb-destructive/30 rounded-xl">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-cb-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-cb-destructive">Delete this address?</p>
              <p className="text-xs text-cb-muted-fg mt-0.5">This cannot be undone.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs rounded-full"
              onClick={() => {
                onDeleteAddress(address.id);
                setShowDeleteConfirm(false);
              }}
            >
              Delete
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs rounded-full border-cb-border"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
