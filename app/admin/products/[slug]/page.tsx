import type { Metadata } from "next";
import ProductEditClient from "./product-edit-client";

export const metadata: Metadata = { title: "Edit product — Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminProductEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProductEditClient slug={slug} />;
}
