"use client";

import { useAuth } from "@/components/supabase-auth-provider";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import ProfileForm from "@/components/profile/ProfileForm";
import AddressList from "@/components/profile/AddressList";
import AddressFormModal from "@/components/profile/AddressFormModal";
import { useProfile } from "@/hooks/useProfile";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
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
    setShowAddAddress,
    setAddressData,
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
              onAddAddress={() => setShowAddAddress(true)}
              onEditAddress={handleEditAddress}
              onSetDefault={handleSetDefault}
              onSignOut={async () => {
                try {
                  const result = await signOut();
                  if (result.success) {
                    window.location.href = "/";
                  } else {
                    console.error('Logout failed:', result.error);
                    // You could add a toast notification here
                    alert('Logout failed. Please try again.');
                  }
                } catch (error) {
                  console.error('Logout error:', error);
                  alert('Logout failed. Please try again.');
                }
              }}
            />
          </div>
        </div>
      </section>

      {/* Address Form Modal */}
      <AddressFormModal
        isOpen={showAddAddress || !!editingAddress}
        isEditing={!!editingAddress}
        isSaving={isSaving}
        addressData={addressData}
        validationErrors={addressValidationErrors}
        addresses={addresses}
        onClose={handleCloseAddressModal}
        onSave={() =>
          editingAddress
            ? handleUpdateAddress(editingAddress)
            : handleAddAddress()
        }
        onInputChange={(field: string, value: string) => {
          if (field === "is_default") {
            setAddressData((prev) => ({
              ...prev,
              is_default: value === "true",
            }));
          } else {
            setAddressData((prev) => ({
              ...prev,
              [field]: value,
            }));
          }
        }}
        onDelete={
          editingAddress ? () => handleDeleteAddress(editingAddress) : undefined
        }
      />
    </div>
  );
}
