import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/services/effective-user";
import { getPackingSlipJSON } from "@/lib/delhivery/client";
import { isDelhiveryOrder } from "@/lib/delhivery/utils";
import LabelPrint from "@/components/admin/LabelPrint";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Shipping Label — Cozyberries",
  robots: { index: false, follow: false },
};

const ORDER_NUMBER_RE = /^ORD-\d{8}-\d{6}-\d{5}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Message({ children }: { children: React.ReactNode }) {
  return <div className="container mx-auto px-4 py-10 text-center text-sm">{children}</div>;
}

export default async function LabelPage({ params }: { params: Promise<{ orderId: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin/orders");
  if (!isAdmin(user as unknown as SupabaseUser)) redirect("/"); // Non-admins should not learn this page exists.

  const { orderId } = await params;
  const admin = createAdminSupabaseClient();
  const column = ORDER_NUMBER_RE.test(orderId) ? "order_number" : UUID_RE.test(orderId) ? "id" : null;
  if (!column) return <Message>Unrecognised order reference.</Message>;

  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, tracking_number, carrier_name")
    .eq(column, orderId)
    .maybeSingle();
  if (!order) return <Message>Order not found.</Message>;
  if (!isDelhiveryOrder(order.carrier_name, order.tracking_number)) {
    return <Message>This order has no Delhivery shipment.</Message>;
  }

  const slip = await getPackingSlipJSON(order.tracking_number as string);
  const pkg = slip.ok ? slip.data.packages?.[0] : undefined;
  if (!pkg) return <Message>Label unavailable from Delhivery. Try again in a minute.</Message>;

  return <LabelPrint pkg={pkg} />;
}
