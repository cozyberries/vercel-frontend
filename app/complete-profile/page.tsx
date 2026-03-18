"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/supabase-auth-provider";
import { validateRequiredPhoneNumber } from "@/lib/utils/validation";
import { Button } from "@/components/ui/button";
import PhoneInput from "@/components/PhoneInput";

function isSafeRedirect(path: string | null): path is string {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes(":")) return false;
  return true;
}

export default function CompleteProfilePage() {
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { user, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  useEffect(() => {
    if (!loading && !user) {
      const loginUrl =
        redirectTo && isSafeRedirect(redirectTo)
          ? `/login?redirect=${encodeURIComponent(redirectTo)}`
          : "/login";
      router.push(loginUrl);
    }
  }, [user, loading, router, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const validation = validateRequiredPhoneNumber(phone);
    if (!validation.isValid) {
      setPhoneError(validation.error || "Invalid phone number");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.replace(/\D/g, "") }),
      });

      if (response.ok) {
        document.cookie =
          "profile_phone_just_saved=1; path=/; max-age=300; SameSite=Lax";
        // Bust the TanStack Query profile cache so the profile page always
        // fetches fresh data instead of serving the pre-redirect stale copy.
        await queryClient.invalidateQueries({ queryKey: ["profile"] });
        const destination = isSafeRedirect(redirectTo) ? redirectTo : "/";
        router.push(destination);
      } else {
        const data = await response.json();
        setError(data.error || "Failed to save phone number");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-light text-gray-900">
            Complete Your Profile
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Please provide your phone number to continue
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <PhoneInput
            value={phone}
            onChange={setPhone}
            error={phoneError}
            onErrorChange={setPhoneError}
          />

          {error && (
            <div className="text-red-600 text-sm text-center">{error}</div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? "Saving..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
