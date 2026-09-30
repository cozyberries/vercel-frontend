import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/services/effective-user";
import OrdersClient from "./orders-client";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Orders — Admin",
  robots: { index: false, follow: false },
};

export default async function AdminOrdersPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin/orders");
  if (!isAdmin(user as unknown as SupabaseUser)) redirect("/"); // Non-admins should not learn this page exists.

  return <OrdersClient />;
}
