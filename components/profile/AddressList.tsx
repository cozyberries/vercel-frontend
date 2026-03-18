"use client";

import { useState } from "react";
import { MapPin, Plus, Edit3, Trash2, AlertTriangle } from "lucide-react";
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

interface AddressListProps {
  addresses: UserAddress[];
  onAddAddress: () => void;
  onEditAddress: (address: UserAddress) => void;
  onDeleteAddress: (id: string) => void;
  onSetDefault: (id: string) => void;
}

function AddressItem({
  address,
  onEditAddress,
  onDeleteAddress,
  onSetDefault,
}: {
  address: UserAddress;
  onEditAddress: (address: UserAddress) => void;
  onDeleteAddress: (id: string) => void;
  onSetDefault: (id: string) => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div className="border border-border rounded-xl p-4 bg-muted/20 hover:bg-muted/30 transition-colors relative">
      {/* Edit + Delete icons — top right */}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEditAddress(address)}
          aria-label="Edit address"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowDeleteConfirm(true)}
          aria-label="Delete address"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="space-y-3 pr-20">
        {/* Header: type, optional nickname, default badge, set-default link */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Type:</span>
          <span className="text-sm font-medium capitalize text-foreground bg-background px-2 py-0.5 rounded-full border">
            {address.address_type}
          </span>
          {address.label && (
            <>
              <span className="text-sm text-muted-foreground">·</span>
              <span className="text-sm text-muted-foreground" title="Nickname for this address">
                {address.label}
              </span>
            </>
          )}
          {address.is_default ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
              Default
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onSetDefault(address.id)}
              className="text-xs text-primary hover:underline focus:outline-none"
            >
              Set as default
            </button>
          )}
        </div>

        {/* Address details */}
        <div className="space-y-1">
          {address.full_name && (
            <p className="font-medium text-foreground text-base">{address.full_name}</p>
          )}
          <div className="text-sm text-muted-foreground space-y-1">
            <p>{address.address_line_1}</p>
            {address.area && <p>{address.area}</p>}
            <p className="font-medium">
              {address.city}, {address.state} {address.postal_code}
            </p>
            <p>{address.country}</p>
            {address.phone && (
              <p className="mt-2">
                <span className="font-medium">Phone:</span> {address.phone}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Inline delete confirmation */}
      {showDeleteConfirm && (
        <div className="mt-3 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Delete this address?</p>
              <p className="text-xs text-muted-foreground mt-0.5">This cannot be undone.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs"
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
              className="h-8 text-xs"
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

export default function AddressList({
  addresses,
  onAddAddress,
  onEditAddress,
  onDeleteAddress,
  onSetDefault,
}: AddressListProps) {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-3">
          <MapPin className="w-6 h-6 text-primary" />
          <h3 className="text-xl font-light">Addresses</h3>
        </div>
        <Button onClick={onAddAddress} size="icon" variant="outline" aria-label="Add new address">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-4">
        {addresses.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="w-16 h-16 mx-auto mb-4 bg-muted/30 rounded-full flex items-center justify-center">
              <MapPin className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground mb-2 font-medium">No addresses added yet</p>
            <p className="text-sm text-muted-foreground">
              Click the + button to create your first address
            </p>
          </div>
        ) : (
          addresses.map((address) => (
            <AddressItem
              key={address.id}
              address={address}
              onEditAddress={onEditAddress}
              onDeleteAddress={onDeleteAddress}
              onSetDefault={onSetDefault}
            />
          ))
        )}
      </div>
    </div>
  );
}
