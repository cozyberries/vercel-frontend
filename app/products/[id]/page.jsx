"use client"

import ProductDetails from "@/components/product-details"

export default function ProductPage({ params }) {
  return <ProductDetails id={params.id} />
} 