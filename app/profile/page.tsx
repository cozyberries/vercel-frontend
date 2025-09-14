"use client";

import { useAuth } from "@/components/supabase-auth-provider";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Home
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Profile</h1>
                <p className="text-gray-600">
                  Manage your personal information and addresses
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                await signOut();
                window.location.href = "/";
              }}
            >
              Logout
            </Button>
          </div>
        </div>

        {/* Profile Form */}
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
        />

        {/* Address List */}
        <AddressList
          addresses={addresses}
          onAddAddress={() => setShowAddAddress(true)}
          onEditAddress={handleEditAddress}
          onDeleteAddress={handleDeleteAddress}
          onSetDefault={handleSetDefault}
        />

        {/* Account Information
        <AccountInfo profile={profile} user={user} /> */}

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
        />
      </div>
    </div>
  );
}
