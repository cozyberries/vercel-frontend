import ProductsClient from "./ProductsClient";

export default function ProductsPage() {
  return (
    <div className="container mx-auto px-4 py-6">
      {/* Visually hidden — design has no visible page title, but keep an h1 for SEO/a11y */}
      <h1 className="sr-only">Our Products</h1>
      <ProductsClient />
    </div>
  );
}
