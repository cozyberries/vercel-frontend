"use client";

import { MapPin, Plus, Star, Trash2, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";

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

interface AddressListProps {
  addresses: UserAddress[];
  onAddAddress: () => void;
  onEditAddress: (address: UserAddress) => void;
  onDeleteAddress: (id: string) => void;
  onSetDefault: (id: string) => void;
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
        <Button onClick={onAddAddress} size="icon" variant="outline">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-4">
        {addresses.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="w-16 h-16 mx-auto mb-4 bg-muted/30 rounded-full flex items-center justify-center">
              <MapPin className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground mb-2 font-medium">
              No addresses added yet
            </p>
            <p className="text-sm text-muted-foreground">
              Click the + button to create your first address
            </p>
          </div>
        ) : (
          addresses.map((address) => (
            <div
              key={address.id}
              className="border border-border rounded-xl p-6 bg-muted/20 hover:bg-muted/30 transition-colors"
            >
              <div className="flex flex-col space-y-4">
                {/* Header with type and default badge */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium capitalize text-foreground bg-background px-3 py-1 rounded-full border">
                      {address.address_type}
                    </span>
                    {address.label && (
                      <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded-full">
                        {address.label}
                      </span>
                    )}
                    {address.is_default && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                        <Star className="w-3 h-3 mr-1" />
                        Default
                      </span>
                    )}
                  </div>
                </div>

                {/* Address Details */}
                <div className="space-y-2">
                  {address.full_name && (
                    <p className="font-medium text-foreground text-base">
                      {address.full_name}
                    </p>
                  )}
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>{address.address_line_1}</p>
                    {address.address_line_2 && <p>{address.address_line_2}</p>}
                    <p className="font-medium">
                      {address.city}, {address.state} {address.postal_code}
                    </p>
                    <p>{address.country}</p>
                    {address.phone && (
                      <p className="mt-2 text-muted-foreground">
                        <span className="font-medium">Phone:</span>{" "}
                        {address.phone}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2 border-t border-border">
                  {!address.is_default && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => onSetDefault(address.id)}
                    >
                      <Star className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onEditAddress(address)}
                  >
                    <Edit3 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onDeleteAddress(address.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
