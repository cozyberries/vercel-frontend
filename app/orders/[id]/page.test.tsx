// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  // Stable references: the page re-fetches whenever `user` changes identity.
  auth: { user: { id: "user-1" }, loading: false },
  order: {} as Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "order-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/supabase-auth-provider", () => ({ useAuth: () => h.auth }));
vi.mock("@/lib/services/orders", () => ({ orderService: { getOrder: async () => ({ order: h.order }) } }));
vi.mock("@/hooks/useApiQueries", () => ({ useOrderShipmentTracking: () => ({ data: undefined }) }));
vi.mock("@/hooks/useReorder", () => ({ useReorder: () => ({ reorder: vi.fn(), isPending: false }) }));
vi.mock("@/components/ui/supabase-image", () => ({ default: () => null }));
vi.mock("@/components/orders/ShipmentTrackingSection", () => ({ ShipmentTrackingSection: () => null }));

import OrderDetailsPage from "./page";

beforeEach(() => {
  h.order = {
    id: "order-1",
    order_number: "ORD-20260928-120000-00001",
    status: "payment_pending",
    fulfilment_method: "delivery",
    total_amount: 1090,
    subtotal: 1000,
    delivery_charge: 90,
    discount_amount: 0,
    created_at: "2026-10-02T10:00:00+05:30",
    updated_at: "2026-10-02T10:00:00+05:30",
    items: [{ id: "p1", name: "Frock", price: 1000, quantity: 1, image: "", size: "3-4Y" }],
    shipping_address: {
      full_name: "Asha Rao", address_line_1: "1 MG Road", city: "Bengaluru", state: "Karnataka",
      postal_code: "560001", country: "India", phone: "9876543210",
    },
    customer_email: "a@b.c",
    customer_phone: "9876543210",
  };
});

describe("order details — payment pending", () => {
  it("points to the IDFC current account and the order's QR, not a phone number", async () => {
    render(<OrderDetailsPage />);
    await screen.findByText(/Complete your payment/);
    expect(screen.getByText("cozyberries@idfcbank")).toBeInTheDocument();
    expect(screen.queryByText("+91 74114 31101")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Show QR code/ })).toHaveAttribute("href", "/payment/order-1");
  });

  it("has no QR link once the payment is being verified (no QR is issued then)", async () => {
    h.order.status = "verifying_payment";
    render(<OrderDetailsPage />);
    await screen.findByText(/Complete your payment/);
    expect(screen.queryByRole("link", { name: /Show QR code/ })).not.toBeInTheDocument();
  });
});
