// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  // Stable references: effects in the page depend on their identity.
  cart: { cart: [{ id: "p1", name: "Frock", price: 1000, quantity: 1, image: "", size: "3-4Y" }] },
  auth: { user: { id: "user-1" }, loading: false, impersonation: { active: false } },
  profile: {
    profile: null,
    addresses: [
      {
        id: "addr-1", is_default: true, address_type: "home", label: "", full_name: "Asha Rao",
        address_line_1: "1 MG Road", area: "", city: "Bengaluru", postal_code: "560001", phone: "9876543210",
      },
    ],
    isLoading: false,
    showAddAddress: false,
    editingAddress: null,
    addressData: {},
    addressValidationErrors: {},
    setShowAddAddress: () => {},
    setAddressData: () => {},
    handleAddAddress: async () => null,
    handleUpdateAddress: async () => null,
    handleCloseAddressModal: () => {},
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/cart-context", () => ({ useCart: () => h.cart }));
vi.mock("@/components/supabase-auth-provider", () => ({ useAuth: () => h.auth }));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => h.profile }));
vi.mock("@/hooks/useCartTotals", () => ({ useCartTotals: () => ({ subtotal: 1000, discountAmount: 0 }) }));
vi.mock("@/components/ui/supabase-image", () => ({ default: () => null }));
vi.mock("@/components/profile/AddressFormModal", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import CheckoutPage from "./page";
import { ADMIN_PRICE_UP_GST_ERROR } from "@/lib/utils/admin-override";

const openPaymentStep = () => {
  render(<CheckoutPage />);
  fireEvent.click(screen.getByRole("button", { name: /Continue to payment/ }));
};

describe("checkout — payment step", () => {
  it("shows no static QR: the QR with the exact amount comes after the order is placed", () => {
    openPaymentStep();
    expect(screen.queryByRole("img", { name: /QR/i })).not.toBeInTheDocument();
    expect(screen.getByText(/QR code with the exact amount/)).toBeInTheDocument();
  });

  it("names the IDFC current account as the UPI ID", () => {
    openPaymentStep();
    expect(screen.getByText("cozyberries@idfcbank")).toBeInTheDocument();
  });

  it("offers no pay-to-phone-number option", () => {
    openPaymentStep();
    expect(screen.queryByText(/Phone number \(UPI\)/)).not.toBeInTheDocument();
    expect(screen.queryByText("+91 74114 31101")).not.toBeInTheDocument();
  });
});

describe("checkout — admin price override in shadow mode", () => {
  beforeEach(() => {
    h.auth.impersonation.active = true;
  });
  afterEach(() => {
    h.auth.impersonation.active = false;
    vi.unstubAllGlobals();
  });

  const openOverride = () => {
    openPaymentStep();
    fireEvent.click(screen.getByLabelText("Apply custom discount override"));
  };
  const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it("raises the subtotal, shows the raise under it and hides the MRP rows", () => {
    openOverride();
    expect(screen.getByText("Total MRP")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Increase %"));
    type("Increase (%)", "10");

    expect(screen.getByText("Includes admin price +10% (+₹100)")).toBeInTheDocument();
    expect(screen.getByText("₹1100")).toBeInTheDocument();
    // ₹1,100 is under ₹1,999, so ₹90 delivery: total ₹1,190 (amount-to-pay card, summary and bottom bar).
    expect(screen.getAllByText("₹1190")).toHaveLength(3);
    expect(screen.queryByText("Total MRP")).not.toBeInTheDocument();
  });

  it("explains a raise past the ₹2,500 GST slab and keeps Place Order disabled", () => {
    h.cart.cart[0].price = 1784;
    try {
      openOverride();
      fireEvent.click(screen.getByLabelText("Increase %"));
      type("Increase (%)", "50");
      type("Reason (required)", "Event price");
      expect(screen.getByText(ADMIN_PRICE_UP_GST_ERROR)).toBeInTheDocument();
      expect(screen.queryByText("Enter a percentage from 0.1 to 100, with at most one decimal.")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Place Order" })).toBeDisabled();
    } finally {
      h.cart.cart[0].price = 1000;
    }
  });

  it("shows a decimal raise as typed", () => {
    openOverride();
    fireEvent.click(screen.getByLabelText("Increase %"));
    type("Increase (%)", "12.5");
    expect(screen.getByText("Includes admin price +12.5% (+₹125)")).toBeInTheDocument();
  });

  it("+100% on ₹1,000 makes delivery free in the preview", () => {
    openOverride();
    fireEvent.click(screen.getByLabelText("Increase %"));
    type("Increase (%)", "100");
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getAllByText("₹2000").length).toBeGreaterThan(0);
  });

  it("shows a percentage discount as an ADMIN_OVERRIDE discount row", () => {
    openOverride();
    fireEvent.click(screen.getByLabelText("Discount %"));
    type("Discount (%)", "10");
    expect(screen.getByText("Discount (ADMIN_OVERRIDE)")).toBeInTheDocument();
    expect(screen.getByText("−₹100")).toBeInTheDocument();
    // amount-to-pay card, summary and bottom bar
    expect(screen.getAllByText("₹990")).toHaveLength(3);
  });

  it("shows a ₹ discount as an ADMIN_OVERRIDE discount row too", () => {
    openOverride();
    type("Discount amount (₹)", "250");
    expect(screen.getByText("Discount (ADMIN_OVERRIDE)")).toBeInTheDocument();
    expect(screen.getByText("−₹250")).toBeInTheDocument();
  });

  it("clears the number when the mode changes", () => {
    openOverride();
    fireEvent.click(screen.getByLabelText("Discount %"));
    type("Discount (%)", "10");
    fireEvent.click(screen.getByLabelText("Increase %"));
    expect(screen.getByLabelText("Increase (%)")).toHaveValue(null);
  });

  it("blocks an out-of-range percentage", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    openOverride();
    fireEvent.click(screen.getByLabelText("Increase %"));
    type("Increase (%)", "150");
    type("Reason (required)", "Event price");

    expect(screen.getByText("Enter a percentage from 0.1 to 100, with at most one decimal.")).toBeInTheDocument();
    const place = screen.getByRole("button", { name: "Place Order" });
    expect(place).toBeDisabled();
    fireEvent.click(place);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends catalogue prices with the mode, percentage and reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ payment_url: "/payment/o1" }) });
    vi.stubGlobal("fetch", fetchMock);
    openOverride();
    fireEvent.click(screen.getByLabelText("Increase %"));
    type("Increase (%)", "10");
    type("Reason (required)", "  Event price ");
    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.items[0].price).toBe(1000);
    expect(body.admin_override).toEqual({ mode: "percent_up", percent: 10, note: "Event price" });
    expect(body).not.toHaveProperty("coupon_code");
  });

  it("sends the ₹ mode with an explicit mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ payment_url: "/payment/o1" }) });
    vi.stubGlobal("fetch", fetchMock);
    openOverride();
    type("Discount amount (₹)", "250");
    type("Reason (required)", "Wholesale");
    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.admin_override).toEqual({ mode: "amount", discount_amount: 250, note: "Wholesale" });
  });
});
