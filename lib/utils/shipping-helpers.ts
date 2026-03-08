import type {
  DelhiveryPincodeResponse,
  PincodeCheckResult,
} from "@/lib/types/shipping";

// ─── Config ──────────────────────────────────────────────────────────────────

/** Staging: https://staging-express.delhivery.com  Production: https://track.delhivery.com */
const DELHIVERY_BASE_URL =
  process.env.DELHIVERY_BASE_URL || "https://track.delhivery.com";

// ─── Delivery Time Estimation ─────────────────────────────────────────────────

/**
 * Estimates delivery days based on ODA status and service type.
 * ODA (On-Demand Area) areas have longer delivery times.
 */
function estimateDeliveryDays(isOda: boolean): { min: number; max: number } {
  if (isOda) {
    // On-Demand Areas: 5-7 business days
    return { min: 5, max: 7 };
  }
  // Regular serviceable areas: 2-4 business days
  return { min: 2, max: 4 };
}

// ─── Pincode Serviceability ──────────────────────────────────────────────────

export async function checkPincodeServiceability(
  pincode: string
): Promise<PincodeCheckResult> {
  const apiKey = process.env.DELIVERY_API_KEY;
  if (!apiKey) throw new Error("DELIVERY_API_KEY is not configured");

  const url = `${DELHIVERY_BASE_URL}/c/api/pin-codes/json/?filter_codes=${pincode}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 86400 }, // cache for 24 hours
  });

  if (!res.ok) {
    throw new Error(`Delhivery pincode API failed: ${res.status}`);
  }

  const data: DelhiveryPincodeResponse = await res.json();

  if (!data.delivery_codes || data.delivery_codes.length === 0) {
    return {
      serviceable: false,
      pincode,
      district: "",
      state_code: "",
      country_code: "",
      prepaid: false,
      cod: false,
      is_oda: false,
      delivery_days: { min: 0, max: 0 },
    };
  }

  const pc = data.delivery_codes[0].postal_code;
  const isOda = pc.is_oda === "Y";

  return {
    serviceable: pc.pre_paid === "Y" || pc.cod === "Y",
    pincode: String(pc.pin),
    district: pc.district,
    state_code: pc.state_code,
    country_code: pc.country_code,
    prepaid: pc.pre_paid === "Y",
    cod: pc.cod === "Y",
    is_oda: isOda,
    delivery_days: estimateDeliveryDays(isOda),
  };
}

// ─── State Code Mapping ──────────────────────────────────────────────────────

const STATE_CODE_TO_NAME: Record<string, string> = {
  AN: "Andaman and Nicobar Islands",
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CG: "Chhattisgarh",
  CH: "Chandigarh",
  DD: "Daman and Diu",
  DL: "Delhi",
  DN: "Dadra and Nagar Haveli",
  GA: "Goa",
  GJ: "Gujarat",
  HP: "Himachal Pradesh",
  HR: "Haryana",
  JH: "Jharkhand",
  JK: "Jammu and Kashmir",
  KA: "Karnataka",
  KL: "Kerala",
  LA: "Ladakh",
  LD: "Lakshadweep",
  MH: "Maharashtra",
  ML: "Meghalaya",
  MN: "Manipur",
  MP: "Madhya Pradesh",
  MZ: "Mizoram",
  NL: "Nagaland",
  OD: "Odisha",
  OR: "Odisha",
  PB: "Punjab",
  PY: "Puducherry",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TN: "Tamil Nadu",
  TR: "Tripura",
  TS: "Telangana",
  UK: "Uttarakhand",
  UP: "Uttar Pradesh",
  WB: "West Bengal",
};

export function stateCodeToName(code: string): string {
  return STATE_CODE_TO_NAME[code.toUpperCase()] || code;
}
