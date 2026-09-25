// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "order-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));
vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

import InvoicePage from "./page";

const base = {
  invoiceDate: "2026-09-25T06:05:00.000Z",
  orderNumber: "ORD-1",
  orderDate: "2026-09-25T06:00:00.000Z",
  seller: { legalName: "Cozyberries", tradeName: "CozyBerries", gstin: "29EPDPR9174E1ZB", addressLines: ["15, CN Enclave"], stateName: "Karnataka", stateCode: "29" },
  buyer: { name: "Asha Rao", phone: "9876543210", email: "a@b.c" },
  shipTo: { kind: "pickup", label: "Self-pickup at Cozyberries Stall" },
  placeOfSupply: { code: "29", name: "Karnataka" },
  mode: "intra",
  lines: [{ description: "Frock · Size 3-4Y", hsn: "6111", quantity: 1, unitPricePaise: 105000, amountPaise: 105000, discountPaise: 0, taxablePaise: 100000, cgstPaise: 2500, sgstPaise: 2500, igstPaise: 0 }],
  totals: { taxablePaise: 100000, cgstPaise: 2500, sgstPaise: 2500, igstPaise: 0, discountPaise: 0, totalPaise: 105000 },
  amountInWords: "Rupees One Thousand Fifty Only",
  paymentMethod: "Cash",
};

function serve(invoice: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ invoice }) }));
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("invoice page", () => {
  it("renders a tax invoice once payment is confirmed", async () => {
    serve({ ...base, status: "issued", invoiceNumber: "CB/26-27/0001" });
    render(<InvoicePage />);
    expect(await screen.findByText("TAX INVOICE")).toBeInTheDocument();
    expect(screen.getByText("CB/26-27/0001")).toBeInTheDocument();
    expect(screen.getByText(/GSTIN: 29EPDPR9174E1ZB/)).toBeInTheDocument();
    expect(screen.getByText(/computer-generated invoice/)).toBeInTheDocument();
  });

  it("never looks like a tax invoice before payment is confirmed", async () => {
    serve({ ...base, status: "pending", invoiceNumber: null, invoiceDate: null, paymentMethod: null });
    render(<InvoicePage />);
    expect(await screen.findByText("ORDER SUMMARY")).toBeInTheDocument();
    expect(screen.queryByText("TAX INVOICE")).not.toBeInTheDocument();
    expect(screen.queryByText(/Invoice No/)).not.toBeInTheDocument();
    expect(screen.queryByText(/computer-generated invoice/)).not.toBeInTheDocument();
    expect(screen.getByText(/not a tax invoice/)).toBeInTheDocument();
  });

  it("prints only the invoice, not the site chrome", async () => {
    serve({ ...base, status: "issued", invoiceNumber: "CB/26-27/0001" });
    const { container } = render(<InvoicePage />);
    await screen.findByText("TAX INVOICE");
    expect(container.querySelector(".invoice-print")).not.toBeNull();
    expect(container.querySelector("style")?.textContent).toContain("body * { visibility: hidden !important; }");
  });
});
