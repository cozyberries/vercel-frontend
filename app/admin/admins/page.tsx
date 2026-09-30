import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin, isSuperAdmin } from "@/lib/services/effective-user";
import { PageHeader } from "@/components/admin/kit";
import AdminsClient from "./admins-client";

export const metadata: Metadata = { title: "Admins — Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin/admins");
  const typed = user as unknown as SupabaseUser;
  if (!isAdmin(typed)) redirect("/");
  if (!isSuperAdmin(typed)) redirect("/admin");

  return (
    <div>
      <PageHeader title="Admins" subtitle="Who can open this section. Super admins are managed in Supabase." />
      <AdminsClient />
    </div>
  );
}
