"use client"

import { useParams, useSearchParams } from "next/navigation"
import ProductDetails from "@/components/product-details"

export default function ProductPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const productId = params.id;
  const initialSize = searchParams.get("size") ?? undefined;

  return <ProductDetails id={productId} initialSize={initialSize} />
} 