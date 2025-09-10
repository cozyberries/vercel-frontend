import { getAllProducts, getCategories } from "@/lib/services/api";
import ProductsClient from "./ProductsClient";

interface ProductsPageProps {
  searchParams: {
    sort?: string;
    type?: string;
  };
}

export default async function ProductsPage({
  searchParams,
}: ProductsPageProps) {
  const [products, categories] = await Promise.all([
    getAllProducts({
      sort: searchParams.sort,
      type: searchParams.type,
    }),
    getCategories(),
  ]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-light mb-4">Our Products</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Discover our complete collection of baby clothing and accessories,
          carefully curated for your little ones.
        </p>
      </div>

      <ProductsClient
        products={products}
        categories={categories}
        currentSort={searchParams.sort}
        currentType={searchParams.type}
      />
    </div>
  );
}
