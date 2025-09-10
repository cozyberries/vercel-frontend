import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getFeaturedProducts } from "@/lib/services/api";
import ProductCard from "./product-card";

export default async function FeaturedProducts() {
  const products = await getFeaturedProducts();

  if (!products.length) {
    return <div className="text-center p-8">No featured products found.</div>;
  }

  return (
    <div className="grid lg:grid-cols-4 grid-cols-2 gap-8">
      {products.slice(0, 4).map((product) => (
        <ProductCard product={product} key={product.id} />
      ))}
      <div className="col-span-full flex justify-center items-center">
        <Button>
          <Link href="/products">View More</Link>
        </Button>
      </div>
    </div>
  );
}
