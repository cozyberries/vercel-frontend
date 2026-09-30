import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin, isSuperAdmin } from "@/lib/services/effective-user";
import AdminShell from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin");
  const typed = user as unknown as SupabaseUser;
  if (!isAdmin(typed)) redirect("/"); // Non-admins should not learn this section exists.

  const name = (typed.user_metadata?.full_name as string | undefined) || typed.email || "";
  const initials = name.trim().charAt(0).toUpperCase() || "A";

  return (
    <AdminShell
      role={isSuperAdmin(typed) ? "super_admin" : "admin"}
      hasPhone={Boolean(typed.phone)}
      userId={typed.id}
      initials={initials}
    >
      {children}
    </AdminShell>
  );
}
