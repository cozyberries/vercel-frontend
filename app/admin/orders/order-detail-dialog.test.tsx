// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OrderDetailDialog from "./order-detail-dialog";
import type { AdminOrder } from "./api";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function makeOrder(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: "o-1",
    order_number: "ORD-1",
    user_id: "u-1",
    status: "processing",
    fulfilment_method: "delivery",
    total_amount: 500,
    created_at: "2026-09-28T10:00:00Z",
    tracking_number: null,
    carrier_name: null,
    delivery_notes: null,
    shipping_address: { full_name: "Asha", phone: "9999999999" },
    items: [{ sku: "frock-red-2-3y", quantity: 1 }],
    payments: [],
    bill_url: null,
    ...overrides,
  };
}

function renderDialog(qc: QueryClient, order: AdminOrder | null) {
  return render(
    <QueryClientProvider client={qc}>
      <OrderDetailDialog order={order} onClose={() => {}} onChanged={() => {}} />
    </QueryClientProvider>
  );
}

describe("OrderDetailDialog resync", () => {
  it("keeps an unsaved tracking-number edit when the same order arrives as a new object reference (background refetch)", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const orderA = makeOrder();
    const { rerender } = renderDialog(qc, orderA);

    expect(screen.getByRole("dialog", { name: /#ORD/ })).toBeInTheDocument();
    const trackingInput = screen.getByLabelText(/Tracking number/i) as HTMLInputElement;
    fireEvent.change(trackingInput, { target: { value: "WB-DRAFT" } });
    expect(trackingInput.value).toBe("WB-DRAFT");

    // Same id, brand-new object — exactly what a list refetch/invalidation hands us.
    const sameOrderNewRef = makeOrder();
    expect(sameOrderNewRef).not.toBe(orderA);
    rerender(
      <QueryClientProvider client={qc}>
        <OrderDetailDialog order={sameOrderNewRef} onClose={() => {}} onChanged={() => {}} />
      </QueryClientProvider>
    );

    expect((screen.getByLabelText(/Tracking number/i) as HTMLInputElement).value).toBe("WB-DRAFT");
  });

  it("resyncs fields when a genuinely different order is opened", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const orderA = makeOrder({ id: "o-1", tracking_number: null });
    const { rerender } = renderDialog(qc, orderA);

    fireEvent.change(screen.getByLabelText(/Tracking number/i), { target: { value: "WB-DRAFT" } });

    const orderB = makeOrder({ id: "o-2", tracking_number: "WB-REAL" });
    rerender(
      <QueryClientProvider client={qc}>
        <OrderDetailDialog order={orderB} onClose={() => {}} onChanged={() => {}} />
      </QueryClientProvider>
    );

    expect((screen.getByLabelText(/Tracking number/i) as HTMLInputElement).value).toBe("WB-REAL");
  });
});

describe("OrderDetailDialog Save button", () => {
  it("is disabled until a field actually changes, so an empty PATCH is never sent", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const order = makeOrder();
    renderDialog(qc, order);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Delivery notes/i), { target: { value: "Leave at gate" } });
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });
});
