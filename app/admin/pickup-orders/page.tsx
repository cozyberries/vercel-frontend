import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/services/effective-user";
import { PageHeader } from "@/components/admin/kit";
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
    <div>
      <PageHeader title="Stall pickups" subtitle="Hand over, mark ready, send the bill." />
      <PickupOrdersClient />
    </div>
  );
}
