// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { retailer } from "@/lib/retail/__fixtures__/retail";
import RetailClient from "./retail-client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const summary = (o = {}) => ({ unitsHeld: 12, mrpValueHeldPaise: 1200000, invoicedPaise: 75000, paidPaise: 0, owedPaise: 75000, lastReportedPeriod: "2026-09", amberBatches: 0, redBatches: 0, oldestSentOn: "2026-05-01", ...o });

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><RetailClient /></QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("RetailClient", () => {
  it("lists shops with stock, money and a red six-month warning", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({
      items: [{ retailer: retailer(), summary: summary({ redBatches: 2 }) }],
      lastPeriod: "2026-09", missingLastPeriod: [], today: "2026-10-08",
    })));
    renderPage();
    const card = await screen.findByTestId("retail-shop");
    expect(card).toHaveTextContent("Kids Corner");
    expect(card).toHaveTextContent("12 pcs · ₹12,000.00 at MRP");
    expect(card).toHaveTextContent("Owes ₹750.00");
    expect(within(card).getByText("2 batches past 6 months: invoice or take back")).toBeInTheDocument();
    expect(card).toHaveTextContent("Last report: Sep 2026");
  });

  it("warns about shops with no report for last month", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ items: [], lastPeriod: "2026-09", missingLastPeriod: ["Tiny Toes"], today: "2026-10-08" })));
    renderPage();
    await screen.findByText("No shops yet"); // wait past the loading skeleton, which is also role=status
    expect(screen.getByRole("status")).toHaveTextContent("No sales report for Sep 2026: Tiny Toes");
  });

  it("shows an empty state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ items: [], lastPeriod: "2026-09", missingLastPeriod: [], today: "2026-10-08" })));
    renderPage();
    expect(await screen.findByText("No shops yet")).toBeInTheDocument();
  });
});
