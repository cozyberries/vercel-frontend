"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Package, Tag } from "lucide-react";
import { SearchSuggestion } from "@/hooks/useSearchSuggestions";

interface SearchSuggestionsProps {
  suggestions: SearchSuggestion[];
  selectedIndex: number;
  onSuggestionClick: (suggestion: SearchSuggestion) => void;
  onSuggestionHover: (index: number) => void;
  isVisible: boolean;
  query: string;
}

export default function SearchSuggestions({
  suggestions,
  selectedIndex,
  onSuggestionClick,
  onSuggestionHover,
  isVisible,
  query,
}: SearchSuggestionsProps) {
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && suggestionsRef.current) {
      const selectedElement = suggestionsRef.current.children[
        selectedIndex
      ] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }
  }, [selectedIndex]);

  if (!isVisible || suggestions.length === 0) {
    return null;
  }

  const getSuggestionUrl = (suggestion: SearchSuggestion) => {
    if (suggestion.type === "product") {
      return `/products/${suggestion.id}`;
    } else {
      return `/products?category=${suggestion.slug}`;
    }
  };

  const getSuggestionIcon = (suggestion: SearchSuggestion) => {
    if (suggestion.type === "product") {
      return <Package className="w-4 h-4 text-muted-foreground" />;
    } else {
      return <Tag className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const highlightText = (text: string, query: string) => {
    if (!query) return text;

    const regex = new RegExp(`(${query})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <span key={index} className="font-semibold text-primary">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  return (
    <div
      ref={suggestionsRef}
      className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto"
    >
      <div className="p-2">
        {suggestions.map((suggestion, index) => (
          <Link
            key={`${suggestion.type}-${suggestion.id}`}
            href={getSuggestionUrl(suggestion)}
            onClick={() => onSuggestionClick(suggestion)}
            onMouseEnter={() => onSuggestionHover(index)}
            className={`flex items-center gap-3 p-3 rounded-md transition-colors cursor-pointer ${
              selectedIndex === index
                ? "bg-primary/10 border border-primary/20"
                : "hover:bg-muted/50"
            }`}
          >
            {/* Icon */}
            <div className="flex-shrink-0">{getSuggestionIcon(suggestion)}</div>

            {/* Image (for products) */}
            {suggestion.type === "product" && suggestion.image && (
              <div className="relative w-10 h-10 bg-muted rounded-md overflow-hidden flex-shrink-0">
                <Image
                  src={suggestion.image}
                  alt={suggestion.name}
                  fill
                  className="object-cover"
                />
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">
                {highlightText(suggestion.name, query)}
              </div>
              {suggestion.type === "product" && suggestion.categoryName && (
                <div className="text-xs text-muted-foreground truncate">
                  in {suggestion.categoryName}
                </div>
              )}
              {suggestion.type === "category" && (
                <div className="text-xs text-muted-foreground">Category</div>
              )}
            </div>

            {/* Type indicator */}
            <div className="flex-shrink-0">
              <Search className="w-4 h-4 text-muted-foreground" />
            </div>
          </Link>
        ))}
      </div>

      {/* Footer with search hint */}
      <div className="border-t border-border p-2 bg-muted/30">
        <div className="text-xs text-muted-foreground text-center">
          Press{" "}
          <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Enter</kbd> to
          search for "{query}"
        </div>
      </div>
    </div>
  );
}
