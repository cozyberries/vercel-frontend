// Mirrors the admin app's isDelhiveryOrder: an order is trackable/cancellable at
// Delhivery when it has an AWB and the carrier is unset or names Delhivery.
export function isDelhiveryOrder(
  carrierName: string | null | undefined,
  trackingNumber: string | null | undefined
): boolean {
  if (!trackingNumber?.trim()) return false;
  const carrier = (carrierName || "").trim().toLowerCase();
  return carrier === "" || carrier.includes("delhivery");
}
