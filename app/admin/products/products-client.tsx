"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorBanner, FilterChips, LoadingList, PageHeader, type FilterChip } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductListItem, ProductReference } from "@/lib/admin/products/types";
import { getVariantUrl } from "@/lib/utils/image";

type Show = "all" | "out" | "no-photos";

const CHIPS: FilterChip<Show>[] = [
  { value: "all", label: "All" },
  { value: "out", label: "Out of stock" },
  { value: "no-photos", label: "No photos" },
];

export interface ProductsResponse {
  products: ProductListItem[];
  reference: ProductReference;
}

export async function fetchProducts(): Promise<ProductsResponse> {
  const res = await fetch("/api/admin/products", { credentials: "same-origin", cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || "Couldn't load products"), { status: res.status });
  return body as ProductsResponse;
}

export function filterProducts(products: ProductListItem[], search: string, show: Show): ProductListItem[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  return products.filter((p) => {
    if (show === "out" && p.stock > 0) return false;
    if (show === "no-photos" && p.photos > 0) return false;
    const haystack = `${p.name} ${p.slug} ${p.category_name ?? ""}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

export default function ProductsClient() {
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<Show>("all");
  const query = useQuery({ queryKey: ["admin", "products"], queryFn: fetchProducts, staleTime: 15_000, refetchOnWindowFocus: true });
  const status = (query.error as { status?: number } | null)?.status;
  const products = query.data ? filterProducts(query.data.products, search, show) : [];

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={query.data ? `${query.data.products.length} products` : undefined}
        action={
          <Button asChild size="sm" className="rounded-full">
            <Link href="/admin/products/new">
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              New product
            </Link>
          </Button>
        }
      />
      <div className="mb-3 grid gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cb-muted-fg" aria-hidden />
          <Input type="search" aria-label="Search products" placeholder="Search by name, print or category" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 pl-9" />
        </div>
        <FilterChips chips={CHIPS} value={show} onChange={setShow} label="Show" large />
      </div>
      {query.isError && (
        <ErrorBanner
          message={(query.error as Error).message}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          loginRedirect={status === 401 || status === 403 ? "/admin/products" : undefined}
        />
      )}
      {query.data ? (
        products.length ? (
          <ul className="divide-y divide-cb-border rounded-2xl border border-cb-border bg-cb-white">
            {products.map((p) => (
              <li key={p.slug}>
                <Link href={`/admin/products/${p.slug}`} className="flex min-h-16 items-center gap-3 px-4 py-2">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- storage thumbnail variant
                    <img src={getVariantUrl(p.image, "thumbnail", "webp")} alt="" width={48} height={48} loading="lazy" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span aria-hidden="true" className="h-12 w-12 shrink-0 rounded-md bg-cb-linen" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium text-cb-fg">{p.name}</span>
                    <span className="block text-xs text-cb-muted-fg">
                      {[p.category_name, `₹${p.price.toLocaleString("en-IN")}`, p.stock > 0 ? `${p.stock} in stock` : null].filter(Boolean).join(" · ")}
                      {p.stock === 0 && <span className="text-red-700"> · Out of stock</span>}
                      {p.photos === 0 && <span className="text-red-700"> · No photos</span>}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-cb-muted-fg">
                    ▸
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No products match" hint="Try another search or show All." />
        )
      ) : (
        !query.isError && <LoadingList rows={4} label="Loading products" />
      )}
    </div>
  );
}
