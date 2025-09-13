"use client";

import { useState } from "react";
import { User, Phone, Edit3, Save, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validatePhoneNumber, validateFullName } from "@/lib/utils/validation";

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  updated_at: string;
}

interface ProfileFormProps {
  profile: UserProfile | null;
  isEditing: boolean;
  isSaving: boolean;
  validationErrors: {
    full_name: string;
    phone: string;
  };
  editData: {
    full_name: string;
    phone: string;
  };
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onInputChange: (field: string, value: string) => void;
}

export default function ProfileForm({
  profile,
  isEditing,
  isSaving,
  validationErrors,
  editData,
  onEdit,
  onSave,
  onCancel,
  onInputChange,
}: ProfileFormProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-medium flex items-center">
          <User className="w-5 h-5 mr-2" />
          Personal Information
        </h3>
        {!isEditing ? (
          <Button onClick={onEdit} className="flex items-center space-x-2">
            <Edit3 className="w-4 h-4" />
            <span>Edit Profile</span>
          </Button>
        ) : (
          <div className="flex space-x-2">
            <Button
              onClick={onSave}
              disabled={
                isSaving ||
                !!validationErrors.full_name ||
                !!validationErrors.phone
              }
              className="flex items-center space-x-2"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? "Saving..." : "Save"}</span>
            </Button>
            <Button
              variant="outline"
              onClick={onCancel}
              className="flex items-center space-x-2"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4">
          <div>
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              value={editData.full_name}
              onChange={(e) => onInputChange("full_name", e.target.value)}
              placeholder="Enter your full name"
              className={
                validationErrors.full_name ? "border-red-500" : ""
              }
            />
            {validationErrors.full_name && (
              <div className="flex items-center mt-1 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 mr-1" />
                {validationErrors.full_name}
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="phone">Phone Number</Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 text-sm">+91</span>
              </div>
              <Input
                id="phone"
                value={editData.phone}
                onChange={(e) => onInputChange("phone", e.target.value)}
                placeholder="98765 43210"
                className={`pl-12 ${validationErrors.phone ? "border-red-500" : ""}`}
              />
            </div>
            {validationErrors.phone && (
              <div className="flex items-center mt-1 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 mr-1" />
                {validationErrors.phone}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <User className="w-4 h-4 text-gray-500" />
            <div>
              <p className="text-sm text-gray-500">Full Name</p>
              <p className="font-medium">
                {profile?.full_name || "Not provided"}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Phone className="w-4 h-4 text-gray-500" />
            <div>
              <p className="text-sm text-gray-500">Phone Number</p>
              <p className="font-medium">
                {profile?.phone || "Not provided"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
