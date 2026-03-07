import type {
  DelhiveryPincodeResponse,
  PincodeCheckResult,
} from "@/lib/types/shipping";

// ─── Config ──────────────────────────────────────────────────────────────────

const DELHIVERY_API_TOKEN = process.env.DELIVERY_API_KEY!;
const DELHIVERY_CLIENT_NAME = process.env.DELHIVERY_CLIENT_NAME!;

/** Staging: https://staging-express.delhivery.com  Production: https://track.delhivery.com */
const DELHIVERY_BASE_URL =
  process.env.DELHIVERY_BASE_URL || "https://track.delhivery.com";

// Pickup / return address from env
export const PICKUP_LOCATION = {
  name: process.env.DELHIVERY_PICKUP_NAME || "CozyBerries Warehouse",
  add: process.env.DELHIVERY_PICKUP_ADDRESS || "",
  city: process.env.DELHIVERY_PICKUP_CITY || "",
  state: process.env.DELHIVERY_PICKUP_STATE || "",
  pin_code: process.env.DELHIVERY_PICKUP_PINCODE || "",
  country: process.env.DELHIVERY_PICKUP_COUNTRY || "India",
  phone: process.env.DELHIVERY_PICKUP_PHONE || "",
};

// ─── Pincode Serviceability ──────────────────────────────────────────────────

export async function checkPincodeServiceability(
  pincode: string
): Promise<PincodeCheckResult> {
  const url = `${DELHIVERY_BASE_URL}/c/api/pin-codes/json/?filter_codes=${pincode}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Token ${DELHIVERY_API_TOKEN}`,
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
    };
  }

  const pc = data.delivery_codes[0].postal_code;

  return {
    serviceable: pc.pre_paid === "Y" || pc.cod === "Y",
    pincode: String(pc.pin),
    district: pc.district,
    state_code: pc.state_code,
    country_code: pc.country_code,
    prepaid: pc.pre_paid === "Y",
    cod: pc.cod === "Y",
    is_oda: pc.is_oda === "Y",
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
