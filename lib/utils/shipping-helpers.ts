import type {
  DelhiveryPincodeResponse,
  DelhiveryTrackingResponse,
  PincodeCheckResult,
  TrackingEvent,
  TrackingInfo,
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

// ─── Waybill Generation ──────────────────────────────────────────────────────

export async function fetchWaybill(): Promise<string> {
  const url = `${DELHIVERY_BASE_URL}/waybill/api/fetch/json/?cl=${DELHIVERY_CLIENT_NAME}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Token ${DELHIVERY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Delhivery waybill API failed: ${res.status}`);
  }

  // The response might be a JSON string or a direct string
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (data.error) throw new Error(data.error);
    return data.waybill || data;
  } catch {
    // Some endpoints return a plain string waybill
    return text.trim();
  }
}

// ─── Create Shipment ─────────────────────────────────────────────────────────

interface CreateShipmentParams {
  waybill: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  customerState: string;
  customerPincode: string;
  customerCountry: string;
  productDescription: string;
  totalAmount: number;
  quantity: number;
  weight: number; // grams
  paymentMode: "Prepaid" | "COD";
  codAmount?: number;
}

export async function createShipment(params: CreateShipmentParams) {
  const url = `${DELHIVERY_BASE_URL}/api/cmu/create.json`;

  const shipmentData = {
    shipments: [
      {
        name: params.customerName,
        add: params.customerAddress,
        pin: params.customerPincode,
        city: params.customerCity,
        state: params.customerState,
        country: params.customerCountry,
        phone: params.customerPhone,
        order: params.orderNumber,
        payment_mode: params.paymentMode,
        return_pin: PICKUP_LOCATION.pin_code,
        return_city: PICKUP_LOCATION.city,
        return_phone: PICKUP_LOCATION.phone,
        return_add: PICKUP_LOCATION.add,
        return_state: PICKUP_LOCATION.state,
        return_country: PICKUP_LOCATION.country,
        return_name: PICKUP_LOCATION.name,
        products_desc: params.productDescription,
        hsn_code: "",
        cod_amount: params.paymentMode === "COD" ? String(params.codAmount || 0) : "0",
        order_date: new Date().toISOString(),
        total_amount: String(params.totalAmount),
        seller_add: PICKUP_LOCATION.add,
        seller_name: PICKUP_LOCATION.name,
        seller_inv: params.orderNumber,
        quantity: String(params.quantity),
        waybill: params.waybill,
        shipment_width: "",
        shipment_height: "",
        weight: String(params.weight),
        seller_gst_tin: process.env.DELHIVERY_SELLER_GST || "",
        shipping_mode: "Surface",
        address_type: "home",
      },
    ],
    pickup_location: {
      name: PICKUP_LOCATION.name,
      add: PICKUP_LOCATION.add,
      city: PICKUP_LOCATION.city,
      pin_code: PICKUP_LOCATION.pin_code,
      country: PICKUP_LOCATION.country,
      phone: PICKUP_LOCATION.phone,
    },
  };

  const formData = `format=json&data=${encodeURIComponent(JSON.stringify(shipmentData))}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${DELHIVERY_API_TOKEN}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delhivery create shipment failed: ${res.status} - ${text}`);
  }

  return res.json();
}

// ─── Tracking ────────────────────────────────────────────────────────────────

export async function fetchTracking(waybill: string): Promise<TrackingInfo> {
  const url = `${DELHIVERY_BASE_URL}/api/v1/packages/json/?waybill=${waybill}&token=${DELHIVERY_API_TOKEN}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    next: { revalidate: 300 }, // cache for 5 minutes
  });

  if (!res.ok) {
    throw new Error(`Delhivery tracking API failed: ${res.status}`);
  }

  const data: DelhiveryTrackingResponse = await res.json();

  if (!data.ShipmentData || data.ShipmentData.length === 0) {
    throw new Error("No tracking data found");
  }

  const shipment = data.ShipmentData[0].Shipment;

  const events: TrackingEvent[] = (shipment.Scans || []).map((scan) => ({
    timestamp: scan.ScanDetail.ScanDateTime,
    status: scan.ScanDetail.Scan,
    status_code: scan.ScanDetail.StatusCode,
    location: scan.ScanDetail.ScannedLocation,
    description: scan.ScanDetail.Instructions,
  }));

  // Reverse so newest events are first
  events.reverse();

  return {
    waybill_number: shipment.AWB,
    current_status: shipment.Status.Status,
    current_location: shipment.Status.StatusLocation,
    current_status_timestamp: shipment.Status.StatusDateTime,
    origin: shipment.Origin,
    destination: shipment.Destination,
    expected_delivery_date: shipment.ExpectedDeliveryDate,
    events,
  };
}

// ─── Pickup Request ──────────────────────────────────────────────────────────

export async function requestPickup(
  pickupDate: string,
  pickupTime: string,
  expectedPackageCount: number
) {
  const url = `${DELHIVERY_BASE_URL}/fm/request/new/`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${DELHIVERY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pickup_time: pickupTime,
      pickup_date: pickupDate,
      pickup_location: PICKUP_LOCATION.name,
      expected_package_count: expectedPackageCount,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delhivery pickup request failed: ${res.status} - ${text}`);
  }

  return res.json();
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
