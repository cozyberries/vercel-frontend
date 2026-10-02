// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
