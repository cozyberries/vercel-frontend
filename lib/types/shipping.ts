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

/** Response from Delhivery waybill fetch API */
export interface DelhiveryWaybillResponse {
  waybill: string;
  error?: string;
}

/** Request body for Delhivery order creation API */
export interface DelhiveryCreateShipmentRequest {
  pickup_location: {
    name: string;
    add: string;
    city: string;
    pin_code: string;
    country: string;
    phone: string;
  };
  shipments: Array<{
    name: string;
    add: string;
    pin: string;
    city: string;
    state: string;
    country: string;
    phone: string;
    order: string;
    payment_mode: "Prepaid" | "COD";
    return_pin: string;
    return_city: string;
    return_phone: string;
    return_add: string;
    return_state: string;
    return_country: string;
    return_name: string;
    products_desc: string;
    hsn_code: string;
    cod_amount: string;
    order_date: string;
    total_amount: string;
    seller_add: string;
    seller_name: string;
    seller_inv: string;
    quantity: string;
    waybill: string;
    shipment_width: string;
    shipment_height: string;
    weight: string;
    seller_gst_tin: string;
    shipping_mode: "Surface" | "Express";
    address_type: string;
  }>;
}

/** Individual scan/event from Delhivery tracking */
export interface DelhiveryTrackingScan {
  ScanDetail: {
    ScanDateTime: string;
    ScanType: string;
    Scan: string;
    StatusDateTime: string;
    ScannedLocation: string;
    Instructions: string;
    StatusCode: string;
  };
}

/** Response from Delhivery tracking API */
export interface DelhiveryTrackingResponse {
  ShipmentData: Array<{
    Shipment: {
      Status: {
        Status: string;
        StatusLocation: string;
        StatusDateTime: string;
        StatusType: string;
        StatusCode: number;
        Instructions: string;
      };
      Scans: DelhiveryTrackingScan[];
      PickUpDate: string;
      Destination: string;
      DestRecievedBy: string;
      Origin: string;
      OrderType: string;
      ChargedWeight: number | null;
      ReferenceNo: string;
      ExpectedDeliveryDate: string | null;
      AWB: string;
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
}

/** Tracking event for UI display */
export interface TrackingEvent {
  timestamp: string;
  status: string;
  status_code: string;
  location: string;
  description: string;
}

/** Tracking info for frontend display */
export interface TrackingInfo {
  waybill_number: string;
  current_status: string;
  current_location: string;
  current_status_timestamp: string;
  origin: string;
  destination: string;
  expected_delivery_date: string | null;
  events: TrackingEvent[];
}

/** Delhivery fields stored on orders table */
export interface OrderDelhiveryFields {
  delhivery_waybill: string | null;
  delhivery_order_id: string | null;
  delhivery_estimated_delivery: string | null;
  shipment_created_at: string | null;
  shipment_creation_error: string | null;
  shipment_creation_attempts: number;
}
