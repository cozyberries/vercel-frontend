// Admin order detail + edit. Status writes go through the DB unmodified so the
// orders_on_status_change trigger keeps sole ownership of stock movements and
// GST invoice numbering. CHECK violations (pickup-only vs delivery-only
// statuses) surface as 409.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import CacheService from "@/lib/services/cache";
import { billUrl } from "@/lib/invoice/bill-link";
import type { OrderStatus } from "@/lib/types/order";

// Module-local on purpose: route files may only export handlers/config in Next 15.
const VALID_ORDER_STATUSES: OrderStatus[] = [
  "payment_pending",
  "verifying_payment",
  "payment_confirmed",
  "processing",
  "ready_for_pickup",
  "collected",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

type Row = Record<string, unknown>;

function safeBillUrl(orderId: string): string | null {
  try {
    return billUrl(orderId);
  } catch {
    return null;
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;

  const admin = createAdminSupabaseClient();
  const { data: order, error } = await admin.from("orders").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const [itemsRes, paymentsRes] = await Promise.all([
    admin.from("order_items").select("*").eq("order_id", id),
    admin.from("payments").select("*").eq("order_id", id).order("created_at", { ascending: false }),
  ]);
  return NextResponse.json({
    order: {
      ...order,
      items: itemsRes.data ?? [],
      payments: paymentsRes.data ?? [],
      bill_url: safeBillUrl(id),
    },
  });
}

const EDITABLE_FIELDS = [
  "tracking_number",
  "carrier_name",
  "delivery_notes",
  "estimated_delivery_date",
] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;

  let body: Row;
  try {
    body = (await request.json()) as Row;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const nextStatus = body.status as OrderStatus | undefined;
  if (nextStatus !== undefined && !VALID_ORDER_STATUSES.includes(nextStatus)) {
    return NextResponse.json({ error: `Unknown status: ${String(nextStatus)}` }, { status: 400 });
  }

  const update: Row = {};
  for (const f of EDITABLE_FIELDS) {
    if (f in body) update[f] = body[f];
  }
  if (nextStatus !== undefined) update.status = nextStatus;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const admin = createAdminSupabaseClient();
  const { data: current, error: readError } = await admin
    .from("orders")
    .select("id, user_id, status")
    .eq("id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const changingStatus = nextStatus !== undefined && nextStatus !== current.status;
  let query = admin.from("orders").update(update).eq("id", id);
  if (changingStatus) query = query.eq("status", current.status);
  const { data: updated, error: updateError } = await query.select("*").maybeSingle();

  if (updateError) {
    const status = updateError.code === "23514" ? 409 : 500;
    return NextResponse.json({ error: updateError.message }, { status });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "Order changed while you were editing; reload and retry" },
      { status: 409 }
    );
  }

  if (changingStatus) {
    const { error: auditError } = await admin.from("order_status_events").insert({
      order_id: id,
      from_status: current.status,
      to_status: nextStatus,
      actor_admin_id: gate.user.id,
    });
    if (auditError) console.error("[admin-orders] audit insert failed:", auditError.message);
  }

  const userId = current.user_id as string;
  Promise.all([
    CacheService.clearAllOrders(userId),
    CacheService.clearOrderDetails(userId, id),
  ]).catch((e) => console.error("[admin-orders] cache clear failed:", e));

  return NextResponse.json({ order: updated });
}
