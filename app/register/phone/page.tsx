"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PhoneInput from "@/components/PhoneInput";
import { Label } from "@/components/ui/label";
import { validateRequiredPhoneNumber } from "@/lib/utils/validation";

const OTP_VERIFICATION_ID_KEY = "otp_verification_id";
const OTP_PHONE_KEY = "otp_phone";
const OTP_FLOW_TYPE_KEY = "otp_flow_type";
const OTP_AUTH_TOKEN_KEY = "otp_auth_token";

type FlowType = "SMS" | "WHATSAPP";

function isSafeRedirect(path: string | null): path is string {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes(":")) return false;
  return true;
}

export default function RegisterPhonePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [flowType, setFlowType] = useState<FlowType>("SMS");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const registerHref = isSafeRedirect(redirectTo)
    ? `/register?redirect=${encodeURIComponent(redirectTo)}`
    : "/register";

  // Persist redirect so verify API and callback can send user to intended page
  useEffect(() => {
    if (isSafeRedirect(redirectTo)) {
      document.cookie = `auth_redirect=${encodeURIComponent(redirectTo)}; path=/; max-age=300; SameSite=Lax`;
    }
  }, [redirectTo]);

  const handleSendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault?.();
    setError("");
    setPhoneError("");

    const digits = phone.replace(/\D/g, "");
    const phoneValidation = validateRequiredPhoneNumber(digits);
    if (!phoneValidation.isValid) {
      setPhoneError(phoneValidation.error || "Invalid phone number");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/verifynow/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: digits,
          flowType,
          intent: "register",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message =
          res.status === 429
            ? "Too many requests. Please try again later."
            : (data?.error as string) || "Something went wrong. Please try again.";
        setError(message);
        setLoading(false);
        return;
      }

      const { verificationId, authToken } = data;
      if (verificationId) {
        sessionStorage.setItem(OTP_VERIFICATION_ID_KEY, verificationId);
        sessionStorage.setItem(OTP_PHONE_KEY, digits);
        sessionStorage.setItem(OTP_FLOW_TYPE_KEY, flowType);
        if (authToken) sessionStorage.setItem(OTP_AUTH_TOKEN_KEY, authToken);
        router.push("/register/verify");
        return;
      }

      setError("Invalid response. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-light text-gray-900">
            Register with phone
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{" "}
            <Link
              href={registerHref}
              className="font-medium text-primary hover:text-primary/80"
            >
              use email instead
            </Link>
          </p>
        </div>

        <div className="mt-6 space-y-6">
          <div className="space-y-4">
            <PhoneInput
              value={phone}
              onChange={setPhone}
              error={phoneError}
              onErrorChange={setPhoneError}
            />

            <div>
              <Label className="mb-2 block">Send OTP via</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="flowType"
                    value="SMS"
                    checked={flowType === "SMS"}
                    onChange={() => setFlowType("SMS")}
                    className="text-primary focus:ring-primary"
                  />
                  <span className="text-sm">Send via SMS</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="flowType"
                    value="WHATSAPP"
                    checked={flowType === "WHATSAPP"}
                    onChange={() => setFlowType("WHATSAPP")}
                    className="text-primary focus:ring-primary"
                  />
                  <span className="text-sm">Send via WhatsApp</span>
                </label>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={(e) => {
              e.preventDefault();
              handleSendOtp();
            }}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? "Sending OTP..." : "Send OTP"}
          </button>
        </div>
      </div>
    </div>
  );
}
