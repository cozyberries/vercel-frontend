import { formatOrderStatus, getOrderStatusColor } from "@/lib/utils/order-status";

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getOrderStatusColor(status)}`}
    >
      {formatOrderStatus(status)}
    </span>
  );
}
