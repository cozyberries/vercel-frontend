import ProductDetails from "@/components/product-details"

export default function ProductPage({ params }: { params: { id: string } }) {
  return <ProductDetails id={params.id} />
}

