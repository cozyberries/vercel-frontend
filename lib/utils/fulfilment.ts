import type { FulfilmentMethod } from "@/lib/types/order";
import { DELIVERY_CHARGE_INR, FREE_DELIVERY_THRESHOLD } from "@/lib/constants";

/**
 * Parses the `fulfilment_method` a client sent. A missing value means the
 * client predates pickup, so it is delivery. Anything unrecognised is null
 * and the caller must reject it.
 */
export function parseFulfilmentMethod(value: unknown): FulfilmentMethod | null {
  if (value === undefined || value === null) return "delivery";
  return value === "delivery" || value === "pickup" ? value : null;
}

/** Server-authoritative delivery charge in rupees. Pickup is always free. */
export function deliveryChargeFor(
  discountedSubtotal: number,
  method: FulfilmentMethod,
  itemCount: number
): number {
  if (method === "pickup" || itemCount === 0) return 0;
  return discountedSubtotal < FREE_DELIVERY_THRESHOLD ? DELIVERY_CHARGE_INR : 0;
}

/** Delivery needs a chosen address; pickup never does. */
export function canContinueCheckout(input: {
  fulfilment: FulfilmentMethod;
  selectedAddressId: string | null;
}): boolean {
  return input.fulfilment === "pickup" || Boolean(input.selectedAddressId);
}
