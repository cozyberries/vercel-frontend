"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorBanner, LoadingList, PageHeader } from "@/components/admin/kit";
import { PhotoManager, ProductForm } from "@/components/admin/products";
import type { AdminProduct, ProductReference, SaveResult } from "@/lib/admin/products/types";

interface ProductResponse {
  product: AdminProduct;
  reference: ProductReference;
}

async function fetchProduct(slug: string): Promise<ProductResponse> {
  const res = await fetch(`/api/admin/products/${slug}`, { credentials: "same-origin", cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || "Couldn't load the product"), { status: res.status });
  return body as ProductResponse;
}

export default function ProductEditClient({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const key = ["admin", "product", slug];
  // Never refetch behind the form's back: the draft holds unsaved counts.
  const query = useQuery({ queryKey: key, queryFn: () => fetchProduct(slug), staleTime: Infinity });
  const status = (query.error as { status?: number } | null)?.status;

  const setProduct = (product: AdminProduct) => {
    queryClient.setQueryData<ProductResponse>(key, (old) => (old ? { ...old, product } : old));
    void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
  };

  const save = async (body: unknown): Promise<SaveResult> => {
    const res = await fetch(`/api/admin/products/${slug}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Couldn't save; try again");
    setProduct(data.product);
    void queryClient.invalidateQueries({ queryKey: ["admin", "stock"] });
    return data as SaveResult;
  };

  const data = query.data;
  return (
    <div>
      <PageHeader
        title={data?.product.name ?? "Product"}
        subtitle={data ? `/products/${slug}` : undefined}
        action={
          <Link href="/admin/products" className="text-sm font-medium text-cb-terracotta">
            All products
          </Link>
        }
      />
      {query.isError && (
        <ErrorBanner
          message={(query.error as Error).message}
          onRetry={status === 404 ? undefined : () => void query.refetch()}
          retrying={query.isFetching}
          loginRedirect={status === 401 || status === 403 ? `/admin/products/${slug}` : undefined}
        />
      )}
      {data ? (
        <div className="grid gap-4">
          <PhotoManager slug={slug} images={data.product.images} onProduct={setProduct} />
          <ProductForm key={slug} mode="edit" product={data.product} reference={data.reference} onSave={save} />
          <a href={`/products/${slug}`} target="_blank" rel="noreferrer" className="text-center text-sm font-medium text-cb-terracotta">
            View in shop ↗
          </a>
        </div>
      ) : (
        !query.isError && <LoadingList rows={3} label="Loading product" />
      )}
    </div>
  );
}
