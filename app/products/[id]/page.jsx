"use client"

import { useParams } from "next/navigation"
import ProductDetails from "@/components/product-details"

export default function ProductPage() {
  const params = useParams();
  const productId = params.id;

  return <ProductDetails id={productId} />
} 