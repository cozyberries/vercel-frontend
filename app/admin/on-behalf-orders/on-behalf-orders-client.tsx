"use client";

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatPrice } from '@/lib/utils';

interface AdminProfile {
  user_id: string;
  email: string | null;
  full_name: string | null;
}

interface CustomerProfile {
  user_id: string;
  email: string | null;
  full_name: string | null;
}

interface OnBehalfOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  currency: string;
  created_at: string;
  customer: CustomerProfile;
  placed_by_admin: AdminProfile | null;
}

interface ListResponse {
  orders: OnBehalfOrder[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 25;

// Keep in sync with statusColors in app/orders/page.tsx — this is a read-only
// admin surface and we don't want a shared module churn in v1.
const STATUS_COLORS: Record<string, string> = {
  payment_pending: 'bg-orange-100 text-orange-800',
  verifying_payment: 'bg-amber-100 text-amber-800',
  payment_confirmed: 'bg-blue-100 text-blue-800',
  processing: 'bg-blue-100 text-blue-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-800',
};

function statusPillClass(status: string): string {
  return STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800';
}

function formatStatus(status: string): string {
  return status
    .split('_')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function OnBehalfOrdersClient() {
  const [orders, setOrders] = useState<OnBehalfOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextOffset: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/on-behalf-orders?limit=${PAGE_SIZE}&offset=${nextOffset}`,
        { credentials: 'include', cache: 'no-store' }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const body = (await res.json()) as ListResponse;
      setOrders(body.orders);
      setTotal(body.total);
      setOffset(body.offset);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load orders';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(0);
  }, [load]);

  const canPrev = offset > 0;
  const canNext = offset + orders.length < total;
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = offset + orders.length;

  if (isLoading && orders.length === 0) {
    return <SkeletonRows />;
  }

  if (error) {
    return (
      <div className="border border-red-200 bg-red-50 rounded-lg p-6 flex flex-col items-start gap-3">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="h-4 w-4" />
          <p className="text-sm font-medium">Couldn’t load orders</p>
        </div>
        <p className="text-sm text-red-700/80">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load(offset)}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Retrying…
            </>
          ) : (
            'Retry'
          )}
        </Button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="border border-dashed border-gray-200 rounded-lg p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No orders placed on behalf yet. Start by clicking{' '}
          <span className="font-medium">Place order on behalf</span> in the
          Admin menu.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Desktop / tablet: table layout */}
      <div className="hidden md:block border border-gray-200 rounded-lg overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Placed by</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">
                  <span className="text-foreground">#{order.order_number}</span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm text-foreground">
                      {order.customer.email ?? '—'}
                    </span>
                    {order.customer.full_name && (
                      <span className="text-xs text-muted-foreground">
                        {order.customer.full_name}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm text-foreground">
                      {order.placed_by_admin?.email ?? '—'}
                    </span>
                    {order.placed_by_admin?.full_name && (
                      <span className="text-xs text-muted-foreground">
                        {order.placed_by_admin.full_name}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-foreground">
                  {formatDate(order.created_at)}
                </TableCell>
                <TableCell className="text-right text-sm text-foreground">
                  {formatPrice(order.total_amount, undefined, order.currency)}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusPillClass(order.status)}`}
                  >
                    {formatStatus(order.status)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: stacked cards */}
      <ul className="md:hidden space-y-3">
        {orders.map((order) => (
          <li
            key={order.id}
            className="border border-gray-200 rounded-lg bg-white p-4 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                #{order.order_number}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusPillClass(order.status)}`}
              >
                {formatStatus(order.status)}
              </span>
            </div>
            <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Customer</dt>
              <dd className="text-foreground">
                <div>{order.customer.email ?? '—'}</div>
                {order.customer.full_name && (
                  <div className="text-xs text-muted-foreground">
                    {order.customer.full_name}
                  </div>
                )}
              </dd>
              <dt className="text-muted-foreground">Placed by</dt>
              <dd className="text-foreground">
                <div>{order.placed_by_admin?.email ?? '—'}</div>
                {order.placed_by_admin?.full_name && (
                  <div className="text-xs text-muted-foreground">
                    {order.placed_by_admin.full_name}
                  </div>
                )}
              </dd>
              <dt className="text-muted-foreground">Date</dt>
              <dd className="text-foreground">
                {formatDate(order.created_at)}
              </dd>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="text-foreground">
                {formatPrice(order.total_amount, undefined, order.currency)}
              </dd>
            </dl>
          </li>
        ))}
      </ul>

      {/* Pagination footer */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
        <p className="text-xs text-muted-foreground">
          Showing {showingFrom}–{showingTo} of {total}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}
            disabled={!canPrev || isLoading}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(offset + PAGE_SIZE)}
            disabled={!canNext || isLoading}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div
      className="border border-gray-200 rounded-lg p-4 space-y-3 bg-white"
      role="status"
      aria-label="Loading on-behalf orders"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="h-4 w-20 bg-gray-200 rounded" />
          <div className="h-4 flex-1 bg-gray-200 rounded" />
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="h-4 w-16 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}
