import type { Metadata } from "next";
import RetailerClient from "./retailer-client";

export const metadata: Metadata = { title: "Shop — Retail — Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminRetailerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RetailerClient id={id} />;
}
