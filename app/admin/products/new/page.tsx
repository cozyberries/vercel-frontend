import type { Metadata } from "next";
import NewProductClient from "./new-product-client";

export const metadata: Metadata = { title: "New product — Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminNewProductPage() {
  return <NewProductClient />;
}
