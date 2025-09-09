"use client";

import { Button } from "@/components/ui/button";

interface PaginationProps {
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  showPrevNext?: boolean;
  className?: string;
}

export default function Pagination({
  currentPage = 1,
  totalPages = 3,
  onPageChange,
  showPrevNext = true,
  className = "",
}: PaginationProps) {
  const handlePageClick = (page: number) => {
    if (onPageChange && page !== currentPage) {
      onPageChange(page);
    }
  };

  const handlePrev = () => {
    if (currentPage > 1 && onPageChange) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages && onPageChange) {
      onPageChange(currentPage + 1);
    }
  };

  return (
    <div className={`flex justify-center mt-12 ${className}`}>
      {showPrevNext && (
        <Button
          variant="outline"
          className="mr-2"
          disabled={currentPage <= 1}
          onClick={handlePrev}
        >
          Previous
        </Button>
      )}

      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
        <Button
          key={page}
          variant="outline"
          className={`mx-1 ${
            page === currentPage ? "font-medium" : "font-normal"
          }`}
          onClick={() => handlePageClick(page)}
        >
          {page}
        </Button>
      ))}

      {showPrevNext && (
        <Button
          variant="outline"
          className="ml-2"
          disabled={currentPage >= totalPages}
          onClick={handleNext}
        >
          Next
        </Button>
      )}
    </div>
  );
}
