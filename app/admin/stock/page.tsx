import type { Metadata } from "next";
import StockClient from "./stock-client";

export const metadata: Metadata = { title: "Stock — Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminStockPage() {
  return <StockClient />;
}
