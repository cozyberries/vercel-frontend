"use client";

import { useState, useEffect } from "react";
import { ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  // Show button when page is scrolled down
  useEffect(() => {
    const toggleVisibility = () => {
      if (window.pageYOffset > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", toggleVisibility);

    return () => window.removeEventListener("scroll", toggleVisibility);
  }, []);

  // Scroll to top smoothly
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  if (!isVisible) {
    return null;
  }

  return (
    <Button
      onClick={scrollToTop}
      className="lg:opacity-100 opacity-85 fixed bottom-20 right-4 z-50 rounded-full w-12 h-12 bg-white hover:bg-gray-50 shadow-lg border border-gray-200 transition-[opacity,background-color] duration-300"
      size="icon"
      aria-label="Scroll to top"
    >
      <ChevronUp className="w-6 h-6 text-gray-700" />
    </Button>
  );
}
