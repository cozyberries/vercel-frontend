import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/services/effective-user";
import PickupOrdersClient from "./pickup-orders-client";

export const metadata: Metadata = {
  title: "Stall pickups",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PickupOrdersPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/pickup-orders");
  }
  if (!isAdmin(user as unknown as SupabaseUser)) {
    // Non-admins should not learn this page exists.
    redirect("/");
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <h1 className="text-2xl font-light tracking-tight mb-1">Stall pickups</h1>
      <p className="text-sm text-muted-foreground mb-5">
        Paid pickup orders. Mark them ready, hand them over, and send the bill.
      </p>
      <PickupOrdersClient />
    </div>
  );
}
