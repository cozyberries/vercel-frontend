"use client";

import { useState } from "react";
import { Truck } from "lucide-react";

export default function PincodeChecker() {
  const [pincode, setPincode] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "serviceable" | "unserviceable" | "error">("idle");
  const [message, setMessage] = useState("");

  const checkPincode = async () => {
    if (!/^\d{6}$/.test(pincode)) {
      setStatus("error");
      setMessage("Enter a valid 6-digit pincode");
      return;
    }
    setStatus("checking");
    try {
      const res = await fetch(`/api/shipping/pincode-check?pincode=${pincode}`);
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error || "Unable to verify pincode");
        return;
      }
      if (data.serviceable) {
        setStatus("serviceable");
        setMessage(data.area ? `Delivery available — ${data.area}, ${data.city}` : `Delivery available — ${data.city}, ${data.state}`);
      } else {
        setStatus("unserviceable");
        setMessage("Sorry, we don't deliver to this pincode yet");
      }
    } catch {
      setStatus("error");
      setMessage("Unable to verify pincode. Please try again.");
    }
  };

  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-bold text-cb-fg mb-3">
        <Truck className="h-4 w-4" />
        Delivery
      </h3>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={pincode}
          onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
          placeholder="Enter pincode"
          className="flex-1 rounded-lg border border-cb-border bg-cb-linen px-3 py-2.5 text-sm text-cb-fg placeholder:text-cb-muted-fg focus:outline-none focus:ring-1 focus:ring-cb-terracotta"
        />
        <button
          type="button"
          onClick={checkPincode}
          disabled={status === "checking" || pincode.length !== 6}
          className="rounded-lg bg-cb-linen px-4 text-sm font-semibold text-cb-muted-fg disabled:opacity-50 enabled:text-cb-terracotta-deep enabled:hover:bg-cb-mauve-tint"
        >
          {status === "checking" ? "Checking…" : "Check"}
        </button>
      </div>
      {message && (
        <p className={`text-xs mt-2 ${status === "serviceable" ? "text-cb-success" : status === "unserviceable" || status === "error" ? "text-cb-destructive" : ""}`}>
          {message}
        </p>
      )}
    </div>
  );
}
