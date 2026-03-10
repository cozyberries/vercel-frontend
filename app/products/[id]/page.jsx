"use client"

import { Suspense } from "react"
import { useParams, useSearchParams } from "next/navigation"
import ProductDetails from "@/components/product-details"

function ProductPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const productId = params.id;
  const initialSize = searchParams.get("size") ?? undefined;

  return <ProductDetails id={productId} initialSize={initialSize} />
}

export default function ProductPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ProductPageContent />
    </Suspense>
  )
} 