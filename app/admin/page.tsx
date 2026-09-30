import type { Metadata } from "next";
import DashboardClient from "./dashboard-client";

export const metadata: Metadata = { title: "Dashboard — Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminHomePage() {
  return <DashboardClient />;
}
