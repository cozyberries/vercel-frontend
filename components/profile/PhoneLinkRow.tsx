"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import IndianPhoneInput from "@/components/IndianPhoneInput";
import { useAuth } from "@/components/supabase-auth-provider";
import { useProfile } from "@/hooks/useProfile";
import { PROFILE_COMBINED_QUERY_KEY } from "@/hooks/useApiQueries";
import { formatIndianPhoneDisplay } from "@/lib/utils/validation";

type Step = "idle" | "enter" | "code";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data as T;
}

/** Lets any signed-in user attach a verified phone, so phone-OTP login works for them. */
export default function PhoneLinkRow() {
  const { user, refreshProfile } = useAuth();
  const { profile } = useProfile(user);
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("idle");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const current = profile?.phone ? formatIndianPhoneDisplay(profile.phone) : null;

  const reset = () => {
    setStep("idle");
    setPhone("");
    setCode("");
    setVerificationId(null);
    setError(null);
  };

  const send = async () => {
    if (phone.length !== 10) {
      setError("Enter a 10-digit mobile number");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ verificationId: string }>("/api/auth/verifynow/send", { phone, intent: "link" });
      setVerificationId(r.verificationId);
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!verificationId || code.trim().length < 4) {
      setError("Enter the code from the SMS");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post("/api/auth/verifynow/verify", { verificationId, code: code.trim(), intent: "link", phone });
      await refreshProfile();
      if (user?.id) {
        await queryClient.invalidateQueries({ queryKey: [...PROFILE_COMBINED_QUERY_KEY, user.id] });
      }
      toast.success("Phone added");
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify the code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="phone" className="mt-4 rounded-2xl border border-cb-border bg-cb-white px-4 py-4">
      <div className="flex items-center gap-3">
        <Phone className="h-5 w-5 shrink-0 text-cb-fg" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-cb-fg">Phone number</p>
          <p className="text-sm text-cb-muted-fg">{current ? `+91 ${current}` : "Sign in by mobile once a number is added."}</p>
        </div>
        {step === "idle" && (
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setStep("enter")}>
            {current ? "Change" : "Add phone"}
          </Button>
        )}
      </div>

      {step !== "idle" && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void (step === "enter" ? send() : verify());
          }}
        >
          {step === "enter" ? (
            <IndianPhoneInput id="link-phone" aria-label="Phone number" value={phone} onChange={setPhone} autoFocus />
          ) : (
            <Input
              id="link-code"
              aria-label="OTP code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Code from the SMS"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-cb-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={reset} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 rounded-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {step === "enter" ? "Send OTP" : "Verify"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
