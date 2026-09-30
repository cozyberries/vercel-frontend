import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/services/effective-user";
import { PageHeader } from "@/components/admin/kit";
import StallRefillsClient from "./stall-refills-client";

export const metadata: Metadata = {
  title: "Stall refills",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function StallRefillsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/stall-refills");
  }
  if (!isAdmin(user as unknown as SupabaseUser)) {
    // Non-admins should not learn this page exists.
    redirect("/");
  }

  return (
    <div>
      <PageHeader title="Stall refills" subtitle="What sold today and yesterday. Put it back on the shelf, then tick it off." />
      <StallRefillsClient />
    </div>
  );
}
