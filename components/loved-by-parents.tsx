"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProductCard from "./product-card";
import { useProducts } from "@/hooks/useApiQueries";

export default function LovedByParents() {
  const { data, isLoading, error } = useProducts({ limit: 5 });
  const products = data?.products ?? [];

  if (isLoading || error || !products.length) return null;

  return (
    <section className="lg:py-14 py-8 bg-[#f9f7f4]">
      <div className="container mx-auto px-4">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-[21px] md:text-[26px] font-light">Loved by Parents</h2>
          <Button asChild variant="link" className="text-[13px] font-semibold text-cb-terracotta no-underline hover:no-underline">
            <Link href="/products" className="flex items-center gap-0.5">
              See all
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        <div className="flex gap-[14px] lg:gap-[18px] overflow-x-auto pb-2 lg:grid lg:grid-cols-5 lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {products.slice(0, 5).map((product, index) => (
            <div key={product.id} className="w-[46%] sm:w-[220px] lg:w-auto shrink-0 lg:shrink">
              <ProductCard product={product} index={index} currentView="list" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
