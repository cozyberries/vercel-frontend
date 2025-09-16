"use client";

import { useMemo, useState } from "react";
import { usePreloadedData } from "@/components/data-preloader";

export interface SearchSuggestion {
  id: string;
  type: "product" | "category";
  name: string;
  slug?: string;
  categoryName?: string;
  image?: string;
}

export function useSearchSuggestions(
  query: string,
  maxSuggestions: number = 8
) {
  const { products, categories } = usePreloadedData();
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const suggestions = useMemo(() => {
    if (!query || query.length < 2) {
      return [];
    }

    const queryLower = query.toLowerCase();
    const suggestions: SearchSuggestion[] = [];

    // Search products
    const matchingProducts = products
      .filter((product) => {
        const nameMatch = product.name.toLowerCase().includes(queryLower);
        const descriptionMatch = product.description
          ?.toLowerCase()
          .includes(queryLower);
        return nameMatch || descriptionMatch;
      })
      .slice(0, Math.ceil(maxSuggestions * 0.7)) // 70% of suggestions are products
      .map((product) => ({
        id: product.id,
        type: "product" as const,
        name: product.name,
        slug: product.slug,
        categoryName: categories.find((cat) => cat.id === product.categoryId)
          ?.name,
        image: product.image,
      }));

    // Search categories
    const matchingCategories = categories
      .filter(
        (category) =>
          category.name.toLowerCase().includes(queryLower) ||
          category.slug.toLowerCase().includes(queryLower)
      )
      .slice(0, Math.ceil(maxSuggestions * 0.3)) // 30% of suggestions are categories
      .map((category) => ({
        id: category.id,
        type: "category" as const,
        name: category.name,
        slug: category.slug,
        image: category.images?.[0]?.url,
      }));

    // Combine and sort by relevance
    const allSuggestions = [...matchingProducts, ...matchingCategories];

    // Sort by relevance (exact matches first, then partial matches)
    allSuggestions.sort((a, b) => {
      const aExact = a.name.toLowerCase().startsWith(queryLower);
      const bExact = b.name.toLowerCase().startsWith(queryLower);

      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      // If both are exact or both are partial, sort alphabetically
      return a.name.localeCompare(b.name);
    });

    return allSuggestions.slice(0, maxSuggestions);
  }, [query, products, categories, maxSuggestions]);

  const resetSelection = () => setSelectedIndex(-1);

  const selectNext = () => {
    setSelectedIndex((prev) =>
      prev < suggestions.length - 1 ? prev + 1 : prev
    );
  };

  const selectPrevious = () => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
  };

  const selectIndex = (index: number) => {
    setSelectedIndex(index);
  };

  const getSelectedSuggestion = () => {
    return selectedIndex >= 0 ? suggestions[selectedIndex] : null;
  };

  return {
    suggestions,
    selectedIndex,
    resetSelection,
    selectNext,
    selectPrevious,
    selectIndex,
    getSelectedSuggestion,
  };
}
