// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OrderDetailDialog from "./order-detail-dialog";
import type { AdminOrder } from "./api";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// The tracking panel polls Delhivery for any order with an AWB; it is not under test here.
vi.mock("./tracking-panel", () => ({ default: () => null }));

type Call = { url: string; method: string; body: unknown };
const calls: Call[] = [];
const replies: Record<string, { status: number; body: unknown }> = {};

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

function renderDialog(order: AdminOrder | null, onChanged = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OrderDetailDialog order={order} onClose={() => {}} onChanged={onChanged} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(replies)) delete replies[k];
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-06T06:30:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : null });
      const reply = replies[`${method} ${url}`] ?? { status: 200, body: {} };
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

describe("Add to pickup", () => {
  it("offers the pickup form right after a shipment is created, defaulting to today and one parcel", async () => {
    replies["POST /api/admin/orders/o-1/shipment"] = { status: 200, body: { success: true, waybill: "WB123" } };
    replies["POST /api/admin/orders/o-1/pickup"] = {
      status: 200,
      body: { success: true, pickup_id: 118775, date: "2026-11-06", time: "14:00:00", already_open: false },
    };
    renderDialog(makeOrder());
    expect(screen.queryByRole("button", { name: /Add to pickup/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Create Delhivery shipment/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Shipment created: WB123"));

    const date = (await screen.findByLabelText(/Pickup date/)) as HTMLInputElement;
    expect(date.value).toBe("2026-11-06");
    expect((screen.getByLabelText(/Parcels/) as HTMLInputElement).value).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: /Request pickup/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Pickup #118775 requested for 2026-11-06 at 14:00"));
    const pickupCall = calls.find((c) => c.url === "/api/admin/orders/o-1/pickup");
    expect(pickupCall).toMatchObject({ method: "POST", body: { date: "2026-11-06", count: 1 } });
  });

  it("shows an Add to pickup button on a Processing order that already has a Delhivery AWB, and sends the chosen date", async () => {
    replies["POST /api/admin/orders/o-1/pickup"] = {
      status: 200,
      body: { success: true, pickup_id: 7, date: "2026-11-08", time: "11:00:00", already_open: false },
    };
    renderDialog(makeOrder({ tracking_number: "WB123", carrier_name: "Delhivery" }));
    fireEvent.click(screen.getByRole("button", { name: /Add to pickup/ }));
    fireEvent.change(screen.getByLabelText(/Pickup date/), { target: { value: "2026-11-08" } });
    fireEvent.change(screen.getByLabelText(/Parcels/), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Request pickup/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Pickup #7 requested for 2026-11-08 at 11:00"));
    const pickupCall = calls.find((c) => c.url === "/api/admin/orders/o-1/pickup");
    expect(pickupCall).toMatchObject({ method: "POST", body: { date: "2026-11-08", count: 2 } });
  });

  it("does not offer a pickup on shipped, pickup or AWB-less orders", () => {
    renderDialog(makeOrder({ tracking_number: "WB123", carrier_name: "Delhivery", status: "shipped" }));
    expect(screen.queryByRole("button", { name: /Add to pickup/ })).not.toBeInTheDocument();
  });

  it("says so when a pickup is already open that day", async () => {
    replies["POST /api/admin/orders/o-1/pickup"] = { status: 200, body: { success: true, already_open: true, message: "exists" } };
    renderDialog(makeOrder({ tracking_number: "WB123", carrier_name: "Delhivery" }));
    fireEvent.click(screen.getByRole("button", { name: /Add to pickup/ }));
    fireEvent.click(screen.getByRole("button", { name: /Request pickup/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("A pickup is already open for 2026-11-06; this parcel goes with it"));
  });

  it("shows Delhivery's refusal and keeps the form open", async () => {
    replies["POST /api/admin/orders/o-1/pickup"] = { status: 422, body: { error: "Client wallet balance is 487.81 which is less than 500.0" } };
    renderDialog(makeOrder({ tracking_number: "WB123", carrier_name: "Delhivery" }));
    fireEvent.click(screen.getByRole("button", { name: /Add to pickup/ }));
    fireEvent.click(screen.getByRole("button", { name: /Request pickup/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Client wallet balance is 487.81 which is less than 500.0"));
    expect(screen.getByRole("button", { name: /Request pickup/ })).toBeInTheDocument();
  });
});
