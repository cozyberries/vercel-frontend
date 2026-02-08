import ProductsClient from "./ProductsClient";

export default function ProductsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-light mb-4">Our Products</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Discover our complete collection of baby clothing,
          carefully curated for your little ones.
        </p>
      </div>

      <ProductsClient />
    </div>
  );
}
