// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { balance, doc, payment, retailer } from "@/lib/retail/__fixtures__/retail";
import { holdingsFrom } from "@/lib/retail/holdings";
import RetailerClient from "./retailer-client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const summary = { unitsHeld: 3, mrpValueHeldPaise: 300000, invoicedPaise: 75000, paidPaise: 50000, owedPaise: 25000, lastReportedPeriod: "2026-10", amberBatches: 0, redBatches: 1, oldestSentOn: "2026-04-01" };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><RetailerClient id={retailer().id} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("fetch", vi.fn(async () => json({
    detail: {
      retailer: retailer(), summary,
      holdings: holdingsFrom([balance({ sent_on: "2026-04-01" })], "2026-11-08"),
      docs: [doc(), doc({ id: "c1", kind: "challan", period: null, number: "CBC/26-27/0001", doc_date: "2026-04-01" })],
      payments: [payment()], today: "2026-11-08",
    },
  })));
});
afterEach(() => vi.unstubAllGlobals());

describe("RetailerClient", () => {
  it("shows the shop, its tiles and the stock tab with the six-month deadline", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Kids Corner" })).toBeInTheDocument();
    expect(screen.getByText("29AAGFC4321M1ZB · Karnataka · 75% ours")).toBeInTheDocument();
    expect(screen.getByText("₹250.00")).toBeInTheDocument();
    expect(screen.getByText("Invoice or take back by 01-10-2026")).toBeInTheDocument();
  });

  it("switches to documents and payments", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Kids Corner" });
    fireEvent.click(screen.getByRole("tab", { name: /^Documents/ }));
    expect(screen.getByText("CBC/26-27/0001")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /^Payments/ }));
    expect(screen.getByText("₹500.00 · UPI · UTR123")).toBeInTheDocument();
  });
});
