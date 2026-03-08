// ─── Delhivery API Types ─────────────────────────────────────────────────────

/** Response from Delhivery pincode serviceability API */
export interface DelhiveryPincodeResponse {
  delivery_codes: Array<{
    postal_code: {
      pin: number;
      pre_paid: "Y" | "N";
      cod: "Y" | "N";
      pickup: "Y" | "N";
      repl: "Y" | "N";
      district: string;
      state_code: string;
      country_code: string;
      is_oda: "Y" | "N";
    };
  }>;
}

// ─── Application-Level Types ─────────────────────────────────────────────────

/** Pincode check result for frontend */
export interface PincodeCheckResult {
  serviceable: boolean;
  pincode: string;
  district: string;
  state_code: string;
  country_code: string;
  prepaid: boolean;
  cod: boolean;
  is_oda: boolean;
  delivery_days: {
    min: number;
    max: number;
  };
}

