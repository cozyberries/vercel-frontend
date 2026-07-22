export interface AdminProfile {
  user_id: string;
  email: string | null;
  full_name: string | null;
}

export interface CustomerProfile {
  user_id: string;
  email: string | null;
  full_name: string | null;
}

export interface OnBehalfOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  currency: string;
  created_at: string;
  customer: CustomerProfile;
  placed_by_admin: AdminProfile | null;
}

export interface OnBehalfOrdersListResponse {
  orders: OnBehalfOrder[];
  total: number;
  limit: number;
  offset: number;
}
