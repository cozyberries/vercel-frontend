"use client";

import { MapPin, Plus, Star, Trash2 } from "lucide-react";
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
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-medium flex items-center">
          <MapPin className="w-5 h-5 mr-2" />
          Addresses
        </h3>
        <Button
          onClick={onAddAddress}
          className="flex items-center space-x-2"
          size="sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add Address</span>
        </Button>
      </div>

      <div className="space-y-4">
        {addresses.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-gray-500 mb-2">No addresses added yet</p>
            <p className="text-sm text-gray-400">
              Click "Add Address" to create your first address
            </p>
          </div>
        ) : (
          addresses.map((address) => (
            <div key={address.id} className="border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-sm font-medium capitalize">
                      {address.address_type}
                    </span>
                    {address.label && (
                      <span className="text-sm text-gray-500">
                        ({address.label})
                      </span>
                    )}
                    {address.is_default && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        <Star className="w-3 h-3 mr-1" />
                        Default
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600">
                    {address.full_name && (
                      <p className="font-medium">{address.full_name}</p>
                    )}
                    <p>{address.address_line_1}</p>
                    {address.address_line_2 && (
                      <p>{address.address_line_2}</p>
                    )}
                    <p>
                      {address.city}, {address.state}{" "}
                      {address.postal_code}
                    </p>
                    <p>{address.country}</p>
                    {address.phone && (
                      <p className="mt-1">Phone: {address.phone}</p>
                    )}
                  </div>
                </div>
                <div className="flex space-x-2">
                  {!address.is_default && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSetDefault(address.id)}
                    >
                      Set Default
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEditAddress(address)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDeleteAddress(address.id)}
                    className="text-red-600 hover:text-red-700"
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
