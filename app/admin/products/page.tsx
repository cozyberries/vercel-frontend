import type { Metadata } from "next";
import ProductsClient from "./products-client";

export const metadata: Metadata = { title: "Products — Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminProductsPage() {
  return <ProductsClient />;
}
