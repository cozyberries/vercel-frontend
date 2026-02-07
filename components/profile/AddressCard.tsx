"use client";

import { MapPin, Star, Edit3 } from "lucide-react";
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

interface AddressCardProps {
  address: UserAddress;
  onEditAddress: (address: UserAddress) => void;
  onSetDefault: (id: string) => void;
}

export default function AddressCard({
  address,
  onEditAddress,
  onSetDefault,
}: AddressCardProps) {
  return (
    <div className="border border-border rounded-lg p-4 bg-muted/20 hover:bg-muted/30 transition-colors relative">
      {/* Edit Button - Top Right */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => onEditAddress(address)}
        className="absolute top-2 right-2 h-8 w-8"
      >
        <Edit3 className="w-3 h-3" />
      </Button>

      <div className="space-y-3 pr-8">
        {/* Header with type and default badge */}
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium capitalize text-foreground bg-background px-2 py-1 rounded-full border">
              {address.address_type}
            </span>
            {address.label && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                {address.label}
              </span>
            )}
            {address.is_default && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                <Star className="w-3 h-3 mr-1" />
                Default
              </span>
            )}
            {!address.is_default && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => onSetDefault(address.id)}
                className="h-8 w-8"
              >
                <Star className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Address Details */}
        <div className="space-y-1">
          {address.full_name && (
            <p className="font-medium text-foreground text-sm">
              {address.full_name}
            </p>
          )}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>{address.address_line_1}</p>
            {address.address_line_2 && <p>{address.address_line_2}</p>}
            <p className="font-medium">
              {address.city}, {address.state} {address.postal_code}
            </p>
            <p>{address.country}</p>
            {address.phone && (
              <p className="mt-1 text-muted-foreground">
                <span className="font-medium">Phone:</span> {address.phone}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
