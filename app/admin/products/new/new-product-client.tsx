"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorBanner, LoadingList, PageHeader } from "@/components/admin/kit";
import { ProductForm } from "@/components/admin/products";
import { fetchProducts } from "../products-client";

export default function NewProductClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "products"], queryFn: fetchProducts, staleTime: 15_000 });
  const status = (query.error as { status?: number } | null)?.status;

  const create = async (body: unknown) => {
    const res = await fetch("/api/admin/products", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Couldn't add the product; try again");
    void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    // Photos are added on the edit page, which the new product opens on.
    router.push(`/admin/products/${data.slug}`);
  };

  return (
    <div>
      <PageHeader
        title="New product"
        subtitle="Add sizes and details, then photos on the next page"
        action={
          <Link href="/admin/products" className="text-sm font-medium text-cb-terracotta">
            Cancel
          </Link>
        }
      />
      {query.isError && (
        <ErrorBanner
          message={(query.error as Error).message}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          loginRedirect={status === 401 || status === 403 ? "/admin/products/new" : undefined}
        />
      )}
      {query.data ? <ProductForm mode="new" reference={query.data.reference} onCreate={create} /> : !query.isError && <LoadingList rows={2} label="Loading" />}
    </div>
  );
}
