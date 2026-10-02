// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
  // Stable references: the page re-fetches whenever `user` changes identity.
  auth: { user: { id: "user-1" }, loading: false, impersonation: { active: true } },
  cart: { clearCart: () => {} },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ orderId: "order-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => h.auth,
}));
vi.mock("@/components/cart-context", () => ({ useCart: () => h.cart }));
vi.mock("sonner", () => ({ toast: h.toast }));

import PaymentPage from "./page";

const order = { id: "order-1", order_number: "ORD-1", status: "payment_pending", total_amount: 1050 };
const QR_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/payments/cash") throw new TypeError("Failed to fetch");
      if (url.startsWith("/api/payments/upi-links")) {
        return {
          ok: true,
          json: async () => ({
            links: { general: "upi://pay", phonepe: "", gpay: "", paytm: "" },
            qrCode: QR_DATA_URL,
            payee: { upiId: "cozyberries@idfcbank", payeeName: "COZYBERRIES" },
          }),
        };
      }
      return { ok: true, json: async () => ({ order }) };
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("payment page — scan to pay", () => {
  it("shows the order's QR from the API, large enough to scan", async () => {
    render(<PaymentPage />);
    const qr = await screen.findByAltText("UPI QR Code");
    expect(qr).toHaveAttribute("src", QR_DATA_URL);
    expect(Number(qr.getAttribute("width"))).toBeGreaterThanOrEqual(256);
    expect(screen.getByText("Scan QR code with any UPI app to pay")).toBeInTheDocument();
  });

  it("names the account the QR pays, as the API reports it", async () => {
    render(<PaymentPage />);
    await screen.findByAltText("UPI QR Code");
    expect(screen.getByText("cozyberries@idfcbank")).toBeInTheDocument();
    expect(screen.getByText(/COZYBERRIES/)).toBeInTheDocument();
  });

  it("offers no pay-to-phone-number option (it may not reach the IDFC account)", async () => {
    render(<PaymentPage />);
    await screen.findByAltText("UPI QR Code");
    expect(screen.queryByText(/Phone \(UPI/)).not.toBeInTheDocument();
    expect(screen.queryByText("+91 74114 31101")).not.toBeInTheDocument();
  });
});

describe("payment page — staff records cash", () => {
  it("tells staff to retry when the network drops, and re-enables the button", async () => {
    render(<PaymentPage />);
    const button = await screen.findByRole("button", { name: /Received cash/ });
    fireEvent.click(button);
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("Network error — check the connection and try again")
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /Received cash/ })).not.toBeDisabled());
  });
});
