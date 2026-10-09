import type { Holding, RetailerSummary } from "./holdings";
import type { ConsignmentDoc, DiscountRate, Retailer, RetailerPayment } from "./types";

export interface RetailerListItem {
  retailer: Retailer;
  summary: RetailerSummary;
}

export interface RetailerListResponse {
  items: RetailerListItem[];
  /** Last completed IST month, YYYY-MM. */
  lastPeriod: string;
  /** Active shops that held stock by then and have no issued report for it. */
  missingLastPeriod: string[];
  today: string;
}

export interface RetailerDetail {
  retailer: Retailer;
  summary: RetailerSummary;
  holdings: Holding[];
  docs: ConsignmentDoc[];
  payments: RetailerPayment[];
  /** Approved discount rates for every month of this shop. */
  discountRates: DiscountRate[];
  today: string;
}

export interface VariantOption {
  slug: string;
  productName: string;
  size: string;
  pricePaise: number;
  stock: number;
}
