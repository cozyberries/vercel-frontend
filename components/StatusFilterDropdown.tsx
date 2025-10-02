"use client";

import { Filter, ChevronDown, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OrderStatus } from "@/lib/types/order";

const statusIcons: Record<OrderStatus, React.ReactNode> = {
  payment_pending: <div className="w-4 h-4 rounded-full bg-orange-500" />,
  payment_confirmed: <div className="w-4 h-4 rounded-full bg-blue-500" />,
  processing: <div className="w-4 h-4 rounded-full bg-blue-500" />,
  shipped: <div className="w-4 h-4 rounded-full bg-purple-500" />,
  delivered: <div className="w-4 h-4 rounded-full bg-green-500" />,
  cancelled: <div className="w-4 h-4 rounded-full bg-red-500" />,
  refunded: <div className="w-4 h-4 rounded-full bg-gray-500" />,
};

const statusOptions = [
  { value: "payment_pending", label: "Payment Pending" },
  { value: "payment_confirmed", label: "Payment Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

interface StatusFilterDropdownProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function StatusFilterDropdown({
  value,
  onChange,
  className = "",
}: StatusFilterDropdownProps) {
  const selectedOption = statusOptions.find((option) => option.value === value);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="h-11 sm:h-12 px-3 sm:px-4 border-gray-300 focus:ring-2 focus:ring-primary focus:border-primary"
            title={`Filter: ${value
              .replace("_", " ")
              .replace(/\b\w/g, (l) => l.toUpperCase())}`}
          >
            {/* Mobile: Show only filter icon */}
            <div className="sm:hidden">
              <Filter className="w-4 h-4" />
            </div>
            {/* Desktop: Show selected option text */}
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-sm">{selectedOption?.label}</span>
              <ChevronDown className="w-4 h-4 opacity-50" />
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {statusOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onChange(option.value)}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-2 w-full">
                {statusIcons[option.value as OrderStatus]}
                <span>{option.label}</span>
                {value === option.value && (
                  <CheckCircle className="w-4 h-4 ml-auto text-primary" />
                )}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
