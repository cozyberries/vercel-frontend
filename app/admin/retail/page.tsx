import type { Metadata } from "next";
import RetailClient from "./retail-client";

export const metadata: Metadata = { title: "Retail — Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminRetailPage() {
  return <RetailClient />;
}
