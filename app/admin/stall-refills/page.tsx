import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/services/effective-user";
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
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <h1 className="text-2xl font-light tracking-tight mb-1">Stall refills</h1>
      <p className="text-sm text-muted-foreground mb-5">
        What sold today and yesterday. Put it back on the shelf, then tick it off.
      </p>
      <StallRefillsClient />
    </div>
  );
}
