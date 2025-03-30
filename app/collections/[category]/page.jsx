"use client"

import { notFound } from "next/navigation"
import CategoryPage from "@/components/category-page"

const validCategories = ["newborn", "boy", "girl", "accessories"];

export default function Page({ params }) {
  // Basic validation
  if (!validCategories.includes(params.category)) {
    notFound();
  }
  
  return <CategoryPage category={params.category} />
} 