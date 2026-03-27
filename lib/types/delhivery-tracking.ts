/** One scan / status event for the timeline (newest-first in UI). */
export interface ShipmentTrackingScan {
  status: string;
  location?: string;
  /** ISO-like string from carrier (ScanDateTime / StatusDateTime). */
  timestamp?: string;
  remarks?: string;
}

/** Payload returned by our API and consumed by React Query + UI. */
export interface OrderShipmentTrackingData {
  waybill: string;
  /** High-level current status from carrier when available. */
  currentStatus?: string;
  scans: ShipmentTrackingScan[];
}
