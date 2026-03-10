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
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("DELIVERY_API_KEY is not set. Add it to .env.local to enable pincode check.");
  }

  const url = `${DELHIVERY_BASE_URL}/c/api/pin-codes/json/?filter_codes=${pincode}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 86400 }, // cache for 24 hours
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Delhivery pincode API failed: ${res.status} ${res.statusText}${body ? ` - ${body.slice(0, 200)}` : ""}`
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    const raw = await res.text();
    throw new Error(
      `Delhivery pincode API invalid response (${res.status}): ${raw || res.statusText}`
    );
  }

  const deliveryCodes = Array.isArray((data as DelhiveryPincodeResponse).delivery_codes)
    ? (data as DelhiveryPincodeResponse).delivery_codes
    : null;

  if (!deliveryCodes || deliveryCodes.length === 0) {
    return {
      serviceable: false,
      pincode,
      district: "",
      state_code: "",
      country_code: "",
      prepaid: false,
      cod: false,
      is_oda: false,
      area: "",
      delivery_days: { min: 0, max: 0 },
    };
  }

  const first = deliveryCodes[0];
  const pc = first?.postal_code;
  if (!pc || typeof pc !== "object") {
    throw new Error(
      "Delhivery pincode API returned unexpected response shape (missing postal_code)"
    );
  }

  const raw = pc as Record<string, unknown>;
  const isOda = raw.is_oda === "Y";
  const prePaid = raw.pre_paid === "Y";
  const cod = raw.cod === "Y";
  const area = typeof raw.post_office === "string" ? raw.post_office.trim() : typeof raw.area === "string" ? raw.area.trim() : undefined;
  
  return {
    serviceable: prePaid || cod,
    pincode: String(raw.pin ?? pincode),
    district: String(raw.district ?? ""),
    state_code: String(raw.state_code ?? ""),
    country_code: String(raw.country_code ?? ""),
    prepaid: prePaid,
    cod,
    is_oda: isOda,
    area: area || "",
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
