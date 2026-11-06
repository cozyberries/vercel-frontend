// Pure planning for scripts/manifest-shipment.mjs: the Delhivery manifest payload for an order,
// built exactly as app/api/admin/orders/[id]/shipment/route.ts builds it, except that the
// Delhivery order id can be the suffixed re-ship id recorded by scripts/reship-order.mjs.

const PAID_STATUSES = new Set(["payment_confirmed", "processing"]);

/**
 * The order id to send Delhivery: the last "re-ship to … as ORD-…-Rn" line in delivery_notes
 * (written by reship-order.mjs), otherwise the order number itself.
 */
export function delhiveryOrderIdFor(order) {
  const matches = [...String(order.delivery_notes ?? "").matchAll(/re-ship to \d+ as (\S+)/g)];
  return matches.length ? matches[matches.length - 1][1] : order.order_number;
}

/**
 * @param {{
 *   order: Record<string, any>,
 *   items: Array<{ sku?: string | null, quantity?: number | null }>,
 *   payments: Array<{ payment_method?: string | null, status?: string | null }>,
 *   warehouseName: string,
 *   weight?: number,
 *   shippingMode?: "Surface" | "Express",
 * }} args
 */
export function planManifest({ order, items, payments, warehouseName, weight = 500, shippingMode = "Surface" }) {
  if (order.fulfilment_method === "pickup") throw new Error("This is a pickup order; nothing to ship");
  if (String(order.tracking_number ?? "").trim()) {
    throw new Error(`Order already has shipment ${order.tracking_number}; cancel or clear it first`);
  }
  if (!PAID_STATUSES.has(order.status)) {
    throw new Error(`Order is ${order.status}; only a payment_confirmed or processing order can be shipped`);
  }
  const addr = order.shipping_address;
  if (!addr || typeof addr !== "object") throw new Error("Order has no shipping address");
  const warehouse = String(warehouseName ?? "").trim();
  if (!warehouse) throw new Error("No warehouse name (--warehouse or DELHIVERY_WAREHOUSE_NAME)");
  if (!items.length) throw new Error("Order has no items");

  const productsDesc = items.map((it) => `${it.sku || "item"}(${it.quantity ?? 1})`).join("~");
  const totalQty = items.reduce((sum, it) => sum + (it.quantity ?? 1), 0);
  const isCod = payments.some((p) => p.payment_method === "cod" && p.status === "completed");
  const totalAmount = Number(order.total_amount ?? 0);
  const delhiveryOrderId = delhiveryOrderIdFor(order);

  const payload = {
    shipments: [
      {
        name: addr.full_name || "Customer",
        order: delhiveryOrderId,
        phone: addr.phone || order.customer_phone || "",
        add: [addr.address_line_1, addr.address_line_2].filter(Boolean).join(", "),
        pin: parseInt(addr.postal_code || "0", 10),
        city: addr.city || "",
        state: addr.state || "",
        country: addr.country || "India",
        payment_mode: isCod ? "COD" : "Prepaid",
        cod_amount: isCod ? totalAmount : 0,
        total_amount: totalAmount,
        weight,
        products_desc: productsDesc,
        quantity: String(totalQty || 1),
        shipping_mode: shippingMode,
        seller_name: warehouse,
        seller_add: "",
        return_name: warehouse,
        waybill: "",
      },
    ],
    pickup_location: { name: warehouse },
  };

  return { payload, delhiveryOrderId, isCod, totalQty };
}

/** The waybill from a Delhivery create response, or a thrown error with Delhivery's remark. */
export function waybillFrom(data) {
  if (!data || data.success === false || data.error) {
    throw new Error(data?.rmk || "Delhivery rejected the shipment");
  }
  const pkg = data.packages?.[0];
  if (!pkg || pkg.status !== "Success") {
    throw new Error((pkg?.remarks || []).join("; ") || "Delhivery returned no package");
  }
  if (!pkg.waybill) throw new Error("Delhivery returned no waybill");
  return pkg.waybill;
}

/** Redis keys the storefront and admin read for this order (lib/services/cache.ts key shapes). */
export function manifestCacheTargets(order) {
  return {
    keys: [`user:order:${order.user_id}:${order.id}`, "admin:dashboard:actions"],
    patterns: [`user:orders:${order.user_id}:*`],
  };
}
