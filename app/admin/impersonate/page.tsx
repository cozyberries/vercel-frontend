import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/services/effective-user";
import ImpersonateClient from "./impersonate-client";

export const metadata: Metadata = { title: "Impersonate user — Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ImpersonatePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin/impersonate");
  if (!isAdmin(user as unknown as SupabaseUser)) redirect("/");
  return <ImpersonateClient />;
}
