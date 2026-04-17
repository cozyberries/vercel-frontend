"use client";

import { useState } from 'react';
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
import {
  formatOrderStatus,
  getOrderStatusColor,
} from '@/lib/utils/order-status';
import {
  useOnBehalfOrders,
  ON_BEHALF_ORDERS_PAGE_SIZE,
} from '@/hooks/useApiQueries';

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
  // Keep offset in local component state so TanStack Query can cache each
  // page independently via its query key.
  const [offset, setOffset] = useState(0);

  const query = useOnBehalfOrders(offset, ON_BEHALF_ORDERS_PAGE_SIZE);
  const orders = query.data?.orders ?? [];
  const total = query.data?.total ?? 0;
  const error = query.error
    ? query.error instanceof Error
      ? query.error.message
      : 'Failed to load orders'
    : null;
  // Initial fetch (no cached data) shows the skeleton; subsequent refetches
  // keep the stale page visible and use the inline spinner in the retry CTA.
  const isLoading = query.isPending;
  const isRefetching = query.isFetching && !query.isPending;

  const canPrev = offset > 0;
  const canNext = offset + orders.length < total;
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = offset + orders.length;

  if (isLoading) {
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
          onClick={() => void query.refetch()}
          disabled={isRefetching}
        >
          {isRefetching ? (
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
          <span className="font-medium">Impersonate user</span> in the Admin
          menu and place an order in that user&apos;s session.
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
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getOrderStatusColor(order.status)}`}
                  >
                    {formatOrderStatus(order.status)}
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
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getOrderStatusColor(order.status)}`}
              >
                {formatOrderStatus(order.status)}
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
            onClick={() =>
              setOffset((prev) => Math.max(0, prev - ON_BEHALF_ORDERS_PAGE_SIZE))
            }
            disabled={!canPrev || isRefetching}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset((prev) => prev + ON_BEHALF_ORDERS_PAGE_SIZE)}
            disabled={!canNext || isRefetching}
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
