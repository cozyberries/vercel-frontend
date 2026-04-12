"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  validatePhoneNumber,
  validateFullName,
  validateRequiredPhoneNumber,
  validateAddress,
} from "@/lib/utils/validation";
import { getProfileCombined, type ProfileCombinedResponse } from "@/lib/services/api";

const PROFILE_COMBINED_QUERY_KEY = ["profile", "combined"] as const;

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

function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  // New format: {digits}@phone.cozyberries.in
  // Old format: phone+91{digits}@phone.cozyburry.local (existing users)
  return email.endsWith("@phone.cozyberries.in") ||
    (email.startsWith("phone+") && email.includes("@phone."));
}

export function useProfile(user: any, updateEmail?: (email: string) => Promise<{ error: any }>) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<ProfileCombinedResponse>({
    queryKey: [...PROFILE_COMBINED_QUERY_KEY, user?.id],
    queryFn: () => getProfileCombined(),
    staleTime: 1000 * 60,     // 1 min: use cache on repeat visits; invalidate after saves/complete-profile
    gcTime: 1000 * 60 * 10,  // keep in cache for 10 min after unmount
    refetchOnWindowFocus: false,
    enabled: !!user?.id,
  });

  const profile: UserProfile | null = data?.profile ?? null;
  const addresses: UserAddress[] = data?.addresses ?? [];

  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [editingAddress, setEditingAddress] = useState<string | null>(null);

  const [editData, setEditData] = useState({
    full_name: "",
    phone: "",
    email: "",
  });

  const [validationErrors, setValidationErrors] = useState({
    full_name: "",
    phone: "",
    email: "",
  });

  const [emailConfirmationPending, setEmailConfirmationPending] = useState(false);
  const [emailConfirmationAddress, setEmailConfirmationAddress] = useState("");

  const [addressData, setAddressData] = useState({
    address_type: "home" as const,
    label: "",
    full_name: "",
    phone: "",
    address_line_1: "",
    area: "",
    city: "",
    state: "",
    postal_code: "",
    country: "India",
    is_default: false,
  });

  const [addressValidationErrors, setAddressValidationErrors] = useState({
    full_name: "",
    phone: "",
    address_line_1: "",
    area: "",
    city: "",
    state: "",
    postal_code: "",
  });

  const isSavingRef = useRef(false);

  // Sync editData when profile loads or changes from cache/refetch
  useEffect(() => {
    if (data?.profile) {
      setEditData({
        full_name: data.profile.full_name || "",
        phone: data.profile.phone || "",
        email: isPlaceholderEmail(data.profile.email) ? "" : (data.profile.email || ""),
      });
    }
  }, [data?.profile]);

  const validateField = (field: string, value: string) => {
    let error = "";

    if (field === "full_name" && value) {
      const validation = validateFullName(value);
      if (!validation.isValid) {
        error = validation.error || "";
      }
    }

    if (field === "phone" && value) {
      const validation = validatePhoneNumber(value);
      if (!validation.isValid) {
        error = validation.error || "";
      }
    }

    if (field === "email" && value) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        error = "Please enter a valid email address";
      }
    }

    setValidationErrors((prev) => ({
      ...prev,
      [field]: error,
    }));
  };

  const handleInputChange = (field: string, value: string) => {
    setEditData((prev) => ({
      ...prev,
      [field]: value,
    }));

    validateField(field, value);
  };

  const handleSave = async () => {
    if (!user) return;
    const phoneValidation = validateRequiredPhoneNumber(editData.phone);
    if (!phoneValidation.isValid) {
      setValidationErrors({ ...validationErrors, phone: phoneValidation.error || "" });
      return;
    }
    if (editData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editData.email)) {
      setValidationErrors({ ...validationErrors, email: "Please enter a valid email address" });
      return;
    }
    setIsSaving(true);
    try {
      // Handle email update separately (Supabase sends confirmation email)
      const currentEmail = data?.profile?.email ?? "";
      const emailChanged =
        editData.email &&
        !isPlaceholderEmail(editData.email) &&
        editData.email !== currentEmail;

      if (emailChanged && updateEmail) {
        const { error: emailError } = await updateEmail(editData.email);
        if (emailError) {
          setValidationErrors({ ...validationErrors, email: emailError.message || "Failed to update email" });
          return;
        }
        setEmailConfirmationPending(true);
        setEmailConfirmationAddress(editData.email);
      }

      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: editData.full_name, phone: editData.phone }),
      });

      if (response.ok) {
        await queryClient.invalidateQueries({ queryKey: [...PROFILE_COMBINED_QUERY_KEY, user.id] });
        await queryClient.refetchQueries({ queryKey: [...PROFILE_COMBINED_QUERY_KEY, user.id] });
        setIsEditing(false);
        setValidationErrors({ full_name: "", phone: "", email: "" });
      } else {
        const errorData = await response.json();
        alert(`Failed to update profile: ${errorData.error}`);
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      alert("Failed to update profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (profile) {
      setEditData({
        full_name: profile.full_name || "",
        phone: profile.phone || "",
        email: isPlaceholderEmail(profile.email) ? "" : (profile.email || ""),
      });
    }
    setValidationErrors({ full_name: "", phone: "", email: "" });
    setIsEditing(false);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const validateAddressField = (field: string, value: string) => {
    let error = "";
    if (field === "full_name") {
      const validation = validateFullName(value);
      if (!value.trim()) error = "Full name is required";
      else if (!validation.isValid) error = validation.error || "";
    }
    if (field === "phone") {
      const validation = validateRequiredPhoneNumber(value);
      if (!validation.isValid) error = validation.error || "";
    }
    if (
      field === "address_line_1" ||
      field === "city" ||
      field === "state" ||
      field === "postal_code"
    ) {
      if (!value.trim()) {
        const labels: Record<string, string> = {
          address_line_1: "Building / Street address is required",
          city: "City is required",
          state: "State is required",
          postal_code: "PIN code is required",
        };
        error = labels[field];
      } else if (field === "address_line_1") {
        const addressVal = validateAddress(value);
        if (!addressVal.isValid) error = addressVal.error || "";
      }
    }
    setAddressValidationErrors((prev) => ({ ...prev, [field]: error }));
  };

  const validateAllAddressFields = (
    data: typeof addressData
  ): boolean => {
    const errors = {
      full_name: "",
      phone: "",
      address_line_1: "",
      area: "",
      city: "",
      state: "",
      postal_code: "",
    };
    const fullNameVal = validateFullName(data.full_name);
    if (!data.full_name.trim()) errors.full_name = "Full name is required";
    else if (!fullNameVal.isValid) errors.full_name = fullNameVal.error || "";
    const phoneVal = validateRequiredPhoneNumber(data.phone);
    if (!phoneVal.isValid) errors.phone = phoneVal.error || "";
    if (!data.address_line_1.trim()) {
      errors.address_line_1 = "Building / Street address is required";
    } else {
      const addressVal = validateAddress(data.address_line_1);
      if (!addressVal.isValid) errors.address_line_1 = addressVal.error || "";
    }
    if (!data.city.trim()) errors.city = "City is required";
    if (!data.state.trim()) errors.state = "State is required";
    if (!data.postal_code.trim()) errors.postal_code = "PIN code is required";
    setAddressValidationErrors(errors);
    return !Object.values(errors).some((e) => e !== "");
  };

  const handleAddressInputChange = (field: string, value: string) => {
    if (field === "is_default") {
      setAddressData((prev) => ({
        ...prev,
        is_default: value === "true",
      }));
      return;
    }
    setAddressData((prev) => ({ ...prev, [field]: value }));
    const addressFieldsToValidate = [
      "full_name",
      "phone",
      "address_line_1",
      "city",
      "state",
      "postal_code",
    ];
    if (addressFieldsToValidate.includes(field)) {
      validateAddressField(field, value);
    }
  };

  const handleAddAddress = async (): Promise<UserAddress | null> => {
    if (isSavingRef.current) return null;
    if (!validateAllAddressFields(addressData)) {
      return null;
    }
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const response = await fetch("/api/profile/addresses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(addressData),
      });

      if (response.ok) {
        await queryClient.invalidateQueries({ queryKey: [...PROFILE_COMBINED_QUERY_KEY, user.id] });
        await queryClient.refetchQueries({ queryKey: [...PROFILE_COMBINED_QUERY_KEY, user.id] });
        const newAddress: UserAddress = await response.json();
        setShowAddAddress(false);
        setAddressData({
          address_type: "home",
          label: "",
          full_name: "",
          phone: "",
          address_line_1: "",
          area: "",
          city: "",
          state: "",
          postal_code: "",
          country: "India",
          is_default: false,
        });
        setAddressValidationErrors({
          full_name: "",
          phone: "",
          address_line_1: "",
          area: "",
          city: "",
          state: "",
          postal_code: "",
        });
        return newAddress;
      } else {
        const errorData = await response.json();
        if (errorData.error && errorData.error.includes("does not exist")) {
          alert(
            "Addresses table not created yet. Please run the database migration first. See MULTIPLE_ADDRESSES_SETUP.md for instructions."
          );
        } else {
          alert(`Failed to add address: ${errorData.error || "Unknown error"}`);
        }
        return null;
      }
    } catch (error) {
      console.error("Error adding address:", error);
      alert("Failed to add address. Please try again.");
      return null;
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleUpdateAddress = async (addressId: string): Promise<UserAddress | null> => {
    if (isSavingRef.current) return null;
    if (!validateAllAddressFields(addressData)) {
      return null;
    }
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/profile/addresses/${addressId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(addressData),
      });

      if (response.ok) {
        await queryClient.invalidateQueries({ queryKey: [...PROFILE_COMBINED_QUERY_KEY, user.id] });
        await queryClient.refetchQueries({ queryKey: [...PROFILE_COMBINED_QUERY_KEY, user.id] });
        const updatedAddress: UserAddress = await response.json();
        setEditingAddress(null);
        setAddressData({
          address_type: "home",
          label: "",
          full_name: "",
          phone: "",
          address_line_1: "",
          area: "",
          city: "",
          state: "",
          postal_code: "",
          country: "India",
          is_default: false,
        });
        setAddressValidationErrors({
          full_name: "",
          phone: "",
          address_line_1: "",
          area: "",
          city: "",
          state: "",
          postal_code: "",
        });
        return updatedAddress;
      } else {
        const errorData = await response.json();
        alert(`Failed to update address: ${errorData.error}`);
        return null;
      }
    } catch (error) {
      console.error("Error updating address:", error);
      alert("Failed to update address. Please try again.");
      return null;
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      const response = await fetch(`/api/profile/addresses/${addressId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Optimistic update: remove deleted address from cache so UI updates immediately
        const key = [...PROFILE_COMBINED_QUERY_KEY, user.id] as const;
        queryClient.setQueryData<ProfileCombinedResponse>(key, (old) => {
          if (!old) return old;
          return {
            ...old,
            addresses: old.addresses.filter((a) => a.id !== addressId),
          };
        });
        await queryClient.invalidateQueries({ queryKey: [...PROFILE_COMBINED_QUERY_KEY, user.id] });
        await queryClient.refetchQueries({ queryKey: [...PROFILE_COMBINED_QUERY_KEY, user.id] });
        if (editingAddress === addressId) {
          setEditingAddress(null);
          setShowAddAddress(false);
          setAddressData({
            address_type: "home",
            label: "",
            full_name: "",
            phone: "",
            address_line_1: "",
            area: "",
            city: "",
            state: "",
            postal_code: "",
            country: "India",
            is_default: false,
          });
          setAddressValidationErrors({
            full_name: "",
            phone: "",
            address_line_1: "",
            area: "",
            city: "",
            state: "",
            postal_code: "",
          });
        }
      } else {
        const errorData = await response.json();
        alert(`Failed to delete address: ${errorData.error}`);
      }
    } catch (error) {
      console.error("Error deleting address:", error);
      alert("Failed to delete address. Please try again.");
    } finally {
      isSavingRef.current = false;
    }
  };

  const handleSetDefault = async (addressId: string) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      // Find the address to get its complete data
      const addressToUpdate = addresses.find(addr => addr.id === addressId);
      if (!addressToUpdate) {
        alert("Address not found. Please refresh and try again.");
        return;
      }

      // Send complete address data with is_default set to true
      const updateData = {
        address_type: addressToUpdate.address_type,
        label: addressToUpdate.label,
        full_name: addressToUpdate.full_name,
        phone: addressToUpdate.phone,
        address_line_1: addressToUpdate.address_line_1,
        area: addressToUpdate.area,
        city: addressToUpdate.city,
        state: addressToUpdate.state,
        postal_code: addressToUpdate.postal_code,
        country: addressToUpdate.country,
        is_default: true,
      };

      const response = await fetch(`/api/profile/addresses/${addressId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        await queryClient.invalidateQueries({ queryKey: [...PROFILE_COMBINED_QUERY_KEY, user?.id] });
        await queryClient.refetchQueries({ queryKey: [...PROFILE_COMBINED_QUERY_KEY, user?.id] });
      } else {
        const errorData = await response.json();
        alert(`Failed to set default address: ${errorData.error}`);
      }
    } catch (error) {
      console.error("Error setting default address:", error);
      alert("Failed to set default address. Please try again.");
    } finally {
      isSavingRef.current = false;
    }
  };

  const handleEditAddress = (address: UserAddress) => {
    setEditingAddress(address.id);
    setAddressData({
      address_type: address.address_type as any,
      label: address.label || "",
      full_name: address.full_name || "",
      phone: address.phone || "",
      address_line_1: address.address_line_1,
      area: address.area || "",
      city: address.city,
      state: address.state,
      postal_code: address.postal_code,
      country: address.country,
      is_default: address.is_default,
    });
  };

  const handleCloseAddressModal = () => {
    setShowAddAddress(false);
    setEditingAddress(null);
    setAddressData({
      address_type: "home",
      label: "",
      full_name: "",
      phone: "",
      address_line_1: "",
      area: "",
      city: "",
      state: "",
      postal_code: "",
      country: "India",
      is_default: false,
    });
    setAddressValidationErrors({
      full_name: "",
      phone: "",
      address_line_1: "",
      area: "",
      city: "",
      state: "",
      postal_code: "",
    });
  };

  return {
    profile,
    addresses,
    isLoading,
    isSaving,
    isEditing,
    showAddAddress,
    editingAddress,
    editData,
    validationErrors,
    emailConfirmationPending,
    emailConfirmationAddress,
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
  };
}
