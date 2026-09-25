export type OrderStatus =
  | 'payment_pending'
  | 'verifying_payment'
  | 'payment_confirmed'
  | 'processing'
  | 'ready_for_pickup'
  | 'collected'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

/** How the customer gets the goods. Pickup has no address and no delivery charge. */
export type FulfilmentMethod = 'delivery' | 'pickup';

export type PaymentStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export type PaymentMethod = 
  | 'credit_card'
  | 'debit_card'
  | 'net_banking'
  | 'upi'
  | 'wallet'
  | 'cod'
  | 'emi'
  | 'bank_transfer'
  | 'cash';

export type PaymentGateway = 
  | 'razorpay'
  | 'stripe'
  | 'payu'
  | 'paypal'
  | 'phonepe'
  | 'googlepay'
  | 'paytm'
  | 'manual';

export interface ShippingAddress {
  full_name: string;
  address_line_1: string;
  area?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone?: string;
  address_type?: 'home' | 'office' | 'other';
  label?: string;
}

/** A single line-item as returned by the API (joined from the order_items table). */
export interface OrderItem {
  /** product_id / product slug — used for ratings and UI keys */
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  /** Normalised columns — previously nested under product_details */
  size?: string;
  color?: string;
  sku?: string;
}

/** Shape of a line-item as submitted by the client at checkout.
 *  Structurally identical to OrderItem — aliased to avoid duplication. */
export type OrderItemInput = OrderItem;

export interface OrderBase {
  user_id: string;
  customer_email: string;
  customer_phone?: string;
  shipping_address: ShippingAddress | null;
  billing_address?: ShippingAddress;
  subtotal: number;
  delivery_charge: number;
  tax_amount: number;
  total_amount: number;
  currency?: string;
  notes?: string;
  discount_code?: string;
  discount_amount?: number;
  /** Admin user id when the order was placed on behalf of the customer by an
   *  admin (impersonation / shadow mode). Null for all direct customer orders. */
  placed_by_admin_id?: string | null;
  /** Defaults to 'delivery' in the database. */
  fulfilment_method?: FulfilmentMethod;
  /** Buyer name frozen at order time (address name for delivery, account name for pickup). */
  customer_name?: string | null;
  /** 2-digit GST state code; null when the address state could not be resolved. */
  place_of_supply?: string | null;
}

/** Shape inserted into the orders table (no items — stored separately). */
export interface OrderCreate extends OrderBase {}

export interface Order extends OrderBase {
  id: string;
  order_number: string;
  status: OrderStatus;
  fulfilment_method: FulfilmentMethod;
  /** Set by the database when payment is confirmed, e.g. "CB/26-27/0001". */
  invoice_number?: string | null;
  invoice_date?: string | null;
  /** Populated via join from order_items table. */
  items: OrderItem[];
  estimated_delivery_date?: string;
  actual_delivery_date?: string;
  tracking_number?: string;
  delivery_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentBase {
  order_id: string;
  user_id: string;
  payment_reference: string;
  payment_method: PaymentMethod;
  gateway_provider: PaymentGateway;
  amount: number;
  currency?: string;
  gateway_fee?: number;
}

export interface PaymentCreate extends PaymentBase {
  gateway_response?: Record<string, any>;
}

export interface Payment extends PaymentBase {
  id: string;
  internal_reference: string;
  status: PaymentStatus;
  net_amount: number;
  refunded_amount?: number;
  refund_reference?: string;
  refund_reason?: string;
  gateway_response?: Record<string, any>;
  card_last_four?: string;
  card_brand?: string;
  card_type?: string;
  upi_id?: string;
  bank_name?: string;
  bank_reference?: string;
  initiated_at: string;
  completed_at?: string;
  failed_at?: string;
  failure_reason?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

/** Admin-only price override applied at checkout during shadow mode. */
export interface AdminOverride {
  /** Rupees. Server clamps to [0, subtotal] and floors to an integer. */
  discount_amount: number;
  /** Required reason — trimmed length must be 3..500. */
  note: string;
}

export interface CreateOrderRequest {
  items: OrderItemInput[];
  shipping_address_id?: string;
  billing_address_id?: string;
  coupon_code?: string;
  notes?: string;
  admin_override?: AdminOverride;
  fulfilment_method?: FulfilmentMethod;
}

export interface CreateOrderResponse {
  order: Order;
  payment_url?: string;
}

export interface OrderSummary {
  subtotal: number;
  delivery_charge: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
}

// ─── Offers ───────────────────────────────────────────────────────────────────

export interface ActiveOfferResponse {
  code: string
  discountRate: number
  expiresAt: string   // ISO string from API
  label: string
  badgeText: string
  enabled: boolean
}
