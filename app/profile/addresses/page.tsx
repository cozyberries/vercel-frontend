"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Plus, MapPin } from "lucide-react";
import { useAuth } from "@/components/supabase-auth-provider";
import { useProfile } from "@/hooks/useProfile";
import { getIndianPhoneDigits } from "@/lib/utils/validation";
import AddressCard from "@/components/profile/AddressCard";
import AddressFormModal from "@/components/profile/AddressFormModal";

export default function SavedAddressesPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const {
    profile,
    addresses,
    isLoading,
    isSaving,
    showAddAddress,
    editingAddress,
    addressData,
    addressValidationErrors,
    handleAddAddress,
    handleUpdateAddress,
    handleDeleteAddress,
    handleSetDefault,
    handleEditAddress,
    handleCloseAddressModal,
    handleAddressInputChange,
    setShowAddAddress,
    setAddressData,
    setAddressValidationErrors,
  } = useProfile(user);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?redirect=/profile/addresses");
    }
  }, [user, loading, router]);

  const openAddModal = () => {
    setAddressData((prev) => ({
      ...prev,
      phone: getIndianPhoneDigits(profile?.phone ?? ""),
      full_name: profile?.full_name ?? "",
    }));
    setAddressValidationErrors({
      full_name: "",
      phone: "",
      address_line_1: "",
      area: "",
      city: "",
      state: "",
      postal_code: "",
    });
    setShowAddAddress(true);
  };

  if (loading || !user || isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 animate-pulse">
        <div className="h-6 w-40 bg-gray-200 rounded mb-6" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 w-full bg-gray-100 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 pb-28">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/profile" aria-label="Back to profile" className="text-cb-fg">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-cb-fg">Saved Addresses</h1>
      </div>

      {addresses.length === 0 ? (
        <div className="text-center py-16 px-4">
          <div className="w-12 h-12 mx-auto mb-4 bg-cb-linen rounded-full flex items-center justify-center">
            <MapPin className="w-6 h-6 text-cb-muted-fg" />
          </div>
          <p className="text-cb-muted-fg font-medium text-sm">No addresses added yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              onEditAddress={handleEditAddress}
              onSetDefault={handleSetDefault}
              onDeleteAddress={handleDeleteAddress}
            />
          ))}
        </div>
      )}

      <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 z-30 border-t border-cb-border bg-white p-4">
        <button
          type="button"
          onClick={openAddModal}
          className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-full border border-cb-border py-3 text-[15px] font-semibold text-cb-fg"
        >
          <Plus className="h-4 w-4" />
          Add new address
        </button>
      </div>

      <AddressFormModal
        enablePincodeCheck
        profilePhone={profile?.phone ?? undefined}
        profileFullName={profile?.full_name ?? undefined}
        isOpen={showAddAddress || !!editingAddress}
        isEditing={!!editingAddress}
        isSaving={isSaving}
        addressData={addressData}
        validationErrors={addressValidationErrors}
        addresses={addresses}
        onClose={handleCloseAddressModal}
        onSave={async () => {
          if (editingAddress) {
            await handleUpdateAddress(editingAddress);
          } else {
            await handleAddAddress();
          }
        }}
        onInputChange={handleAddressInputChange}
      />
    </div>
  );
}
