"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, AlertCircle } from "lucide-react";
import { useAuth } from "@/components/supabase-auth-provider";
import { useProfile } from "@/hooks/useProfile";
import { formatIndianPhoneDisplay } from "@/lib/utils/validation";
import { isPlaceholderEmail } from "@/lib/utils/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PhoneInput from "@/components/PhoneInput";

export default function AccountDetailsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { profile, isLoading, isSaving, editData, validationErrors, handleInputChange, handleSave } =
    useProfile(user);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?redirect=/profile/account-details");
    }
  }, [user, loading, router]);

  if (loading || !user || isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 animate-pulse">
        <div className="h-6 w-40 bg-gray-200 rounded mb-6" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 w-full bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-md px-4 py-6">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/profile" aria-label="Back to profile" className="text-cb-fg">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-cb-fg">Account details</h1>
      </div>

      <div
        className="space-y-4"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSave();
          }
        }}
      >
        <div>
          <Label htmlFor="full_name">Full name</Label>
          <Input
            id="full_name"
            value={editData.full_name}
            onChange={(e) => handleInputChange("full_name", e.target.value)}
            placeholder="Enter your full name"
            disabled={isSaving}
            className="mt-1 h-12 rounded-xl bg-white"
          />
          {validationErrors.full_name && (
            <div className="flex items-center mt-1 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 mr-1 shrink-0" />
              {validationErrors.full_name}
            </div>
          )}
        </div>

        <PhoneInput
          id="phone"
          label="Mobile number"
          value={editData.phone}
          onChange={(digits) => handleInputChange("phone", digits)}
          error={validationErrors.phone}
        />

        <div>
          <Label htmlFor="email">
            Email <span className="text-cb-muted-fg font-normal">(optional)</span>
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="For order updates & invoices"
            value={isPlaceholderEmail(editData.email) ? "" : editData.email}
            onChange={(e) => handleInputChange("email", e.target.value)}
            disabled={isSaving}
            className="mt-1 h-12 rounded-xl bg-white"
          />
          {validationErrors.email ? (
            <div className="flex items-center mt-1 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 mr-1 shrink-0" />
              {validationErrors.email}
            </div>
          ) : (
            <p className="mt-1 text-xs text-cb-muted-fg">Your email will be updated immediately.</p>
          )}
        </div>

        <Button
          onClick={handleSave}
          disabled={isSaving || !!validationErrors.full_name || !!validationErrors.phone || !!validationErrors.email}
          className="w-full h-12 rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white font-semibold"
        >
          {isSaving ? "Saving..." : "Save changes"}
        </Button>

        {profile?.phone && !isSaving && (
          <p className="text-center text-xs text-cb-muted-fg">
            Currently +91 {formatIndianPhoneDisplay(profile.phone)}
          </p>
        )}
      </div>
    </div>
  );
}
