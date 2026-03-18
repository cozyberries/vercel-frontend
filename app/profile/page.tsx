"use client";

import React from "react";
import { useAuth } from "@/components/supabase-auth-provider";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getIndianPhoneDigits } from "@/lib/utils/validation";
import ProfileForm from "@/components/profile/ProfileForm";
import AddressFormModal from "@/components/profile/AddressFormModal";
import { useProfile } from "@/hooks/useProfile";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const {
    profile,
    addresses,
    isLoading,
    isSaving,
    isEditing,
    showAddAddress,
    editingAddress,
    editData,
    validationErrors,
    addressData,
    addressValidationErrors,
    handleInputChange,
    handleSave,
    handleCancel,
    handleEdit,
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

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Please log in to view your profile
          </h1>
          <Link href="/login">
            <Button>Go to Login</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Personal Information Section */}
      <section className="py-20 bg-[#f9f7f4]">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-light text-center mb-12">
            Personal Information
          </h2>
          <p className="hidden md:block text-lg text-muted-foreground text-center mb-12">
            Manage your personal information and addresses
          </p>
          <div className="max-w-4xl mx-auto">
            <ProfileForm
              profile={profile}
              isEditing={isEditing}
              isSaving={isSaving}
              validationErrors={validationErrors}
              editData={editData}
              onEdit={handleEdit}
              onSave={handleSave}
              onCancel={handleCancel}
              onInputChange={handleInputChange}
              addresses={addresses}
              onAddAddress={() => {
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
              }}
              onEditAddress={handleEditAddress}
              onSetDefault={handleSetDefault}
              onDeleteAddress={handleDeleteAddress}
              onSignOut={async () => {
                if (isLoggingOut) return;

                try {
                  setIsLoggingOut(true);
                  console.log("Logout button clicked from profile");
                  const result = await signOut();
                  console.log("Logout result:", result);

                  if (result.success) {
                    window.location.href = "/";
                  } else {
                    console.error("Logout failed:", result.error);
                    alert("Logout failed. Please try again.");
                  }
                } catch (error) {
                  console.error("Logout error:", error);
                  alert("Logout failed. Please try again.");
                } finally {
                  setIsLoggingOut(false);
                }
              }}
            />
          </div>
        </div>
      </section>

      {/* Address Form Modal */}
      <AddressFormModal
        enablePincodeCheck
        profilePhone={profile?.phone ?? undefined}
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
