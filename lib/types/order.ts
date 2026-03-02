export type OrderStatus = 
  | 'payment_pending'
  | 'payment_confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

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
  | 'bank_transfer';

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
  address_line_2?: string;
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

/** Shape of a line-item as submitted by the client at checkout. */
export interface OrderItemInput {
  /** product_id / product slug */
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  size?: string;
  color?: string;
  sku?: string;
}

export interface OrderBase {
  user_id: string;
  customer_email: string;
  customer_phone?: string;
  shipping_address: ShippingAddress;
  billing_address?: ShippingAddress;
  subtotal: number;
  delivery_charge: number;
  tax_amount: number;
  total_amount: number;
  currency?: string;
  notes?: string;
}

/** Shape inserted into the orders table (no items — stored separately). */
export interface OrderCreate extends OrderBase {}

export interface Order extends OrderBase {
  id: string;
  order_number: string;
  status: OrderStatus;
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

export interface CreateOrderRequest {
  items: OrderItemInput[];
  shipping_address_id: string;
  billing_address_id?: string;
  notes?: string;
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
