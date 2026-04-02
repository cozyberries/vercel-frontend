import { createAdminSupabaseClient } from "@/lib/supabase-server";
import type { OrderStatus } from "@/lib/types/order";

/**
 * Broadcast admin notification when a customer completes checkout (storefront order creation).
 * Mirrors cozyberries-admin `notifyAdminsOrderPlaced` so the notification center stays consistent.
 */
export async function notifyAdminsOrderPlacedFromCheckout(order: {
  id: string;
  order_number: string;
  status: OrderStatus;
  total_amount: number;
  currency?: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
}): Promise<void> {
  try {
    const supabase = createAdminSupabaseClient();
    const { data: admins, error: adminError } = await supabase
      .from("admin_users")
      .select("id")
      .eq("is_active", true);

    if (adminError) {
      throw new Error(`Failed to fetch admin users: ${adminError.message}`);
    }
    if (!admins?.length) {
      return;
    }

    const title = "New order placed";
    const namePart = order.customer_name?.trim() || order.customer_email?.trim() || "Customer";
    const message = `${order.order_number} · ${formatMoney(order.total_amount, order.currency)} · ${namePart}`;

    const meta = {
      lifecycle_event: "order_placed" as const,
      order_id: order.id,
      order_number: order.order_number,
      order_status: order.status,
      customer_name: order.customer_name?.trim() || undefined,
      customer_email: order.customer_email?.trim() || undefined,
    };

    const { error: insertError } = await supabase.from("notifications").insert({
      user_id: null,
      title,
      message,
      type: "order_status",
      read: false,
      meta,
    });

    if (insertError) {
      throw new Error(`Notification insert failed: ${insertError.message}`);
    }
  } catch (error) {
    console.error("notifyAdminsOrderPlacedFromCheckout failed:", error);
  }
}

function formatMoney(amount: number, currency: string | null | undefined): string {
  const c = (currency ?? "INR").toUpperCase();
  if (c === "INR") {
    return `₹${amount.toFixed(2)}`;
  }
  return `${amount.toFixed(2)} ${c}`;
}
