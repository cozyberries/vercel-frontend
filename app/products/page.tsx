import { getAllProducts } from "@/lib/services/api";
import ProductsClient from "../../components/products-client";

export default async function ProductsPage() {
  const products = await getAllProducts();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-light mb-4">Our Products</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Discover our complete collection of baby clothing and accessories,
          carefully curated for your little ones.
        </p>
      </div>

      <ProductsClient products={products} />

      <div className="flex justify-center mt-12">
        <button className="mr-2 pointer-events-none opacity-50 border rounded px-4 py-2">
          Previous
        </button>
        <button className="border rounded px-4 py-2 font-medium">1</button>
        <button className="border rounded px-4 py-2 font-normal">2</button>
        <button className="border rounded px-4 py-2 font-normal">3</button>
        <button className="ml-2 border rounded px-4 py-2">Next</button>
      </div>
    </div>
  );
}
