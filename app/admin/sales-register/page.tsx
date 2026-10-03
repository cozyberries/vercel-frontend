import type { Metadata } from "next";
import SalesRegisterClient from "./sales-register-client";

export const metadata: Metadata = { title: "Sales register — Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminSalesRegisterPage() {
  return <SalesRegisterClient />;
}
