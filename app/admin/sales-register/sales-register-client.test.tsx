// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import SalesRegisterClient from "./sales-register-client";
import { GSTIN, NOW, salesRegisterFixture } from "@/lib/gst/__fixtures__/register";
import { buildSalesRegister } from "@/lib/gst/sales-register";
import type { SalesRegister } from "@/lib/gst/register-types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function stubRegister(respond: (url: string) => Response = () => json({ register: salesRegisterFixture() })) {
  const f = vi.fn(async (url: string) => respond(url));
  vi.stubGlobal("fetch", f);
  return f;
}

function renderPage(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={qc}>
      <SalesRegisterClient />
    </QueryClientProvider>,
  );
}

const tile = (label: string) => screen.getByText(label).parentElement!;
const empty = (month: string): SalesRegister =>
  buildSalesRegister({ month, orders: [], cancelledEarlier: [], missingNumbers: [], gstin: GSTIN, now: NOW });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  window.history.replaceState(null, "", "/admin/sales-register");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SalesRegisterClient", () => {
  it("opens on the last completed month and lists every month since registration", async () => {
    const f = stubRegister();
    renderPage();
    expect(await screen.findByText("01-09-2026 to 30-09-2026")).toBeInTheDocument();
    expect(f).toHaveBeenCalledWith("/api/admin/sales-register?month=2026-09", expect.objectContaining({ cache: "no-store" }));
    const chips = within(screen.getByRole("radiogroup", { name: "Month" })).getAllByRole("radio");
    expect(chips.map((c) => c.textContent)).toEqual(["Oct 2026 · so far", "Sep 2026"]);
    expect(chips[1]).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Download Excel" })).toBeInTheDocument();
    expect(screen.queryByText("Month not finished")).toBeNull();
  });

  it("shows the net totals, the tax split and the invoice counts", async () => {
    stubRegister();
    renderPage();
    await screen.findByText("01-09-2026 to 30-09-2026");
    expect(tile("Invoice value")).toHaveTextContent("₹2,190.00");
    expect(within(tile("Net invoices")).getByText("2")).toBeInTheDocument();
    expect(tile("Net invoices")).toHaveTextContent("3 issued · 1 cancelled");
    expect(tile("Taxable value")).toHaveTextContent("₹2,085.71");
    expect(tile("Total tax")).toHaveTextContent("₹104.29");
    expect(tile("Total tax")).toHaveTextContent("CGST ₹52.14 · SGST ₹52.15 · IGST ₹0.00");
    const split = screen.getByRole("region", { name: "Stall vs Online" });
    expect(split).toHaveTextContent("Stall ₹1,050.00 · 48%");
    expect(split).toHaveTextContent("Online ₹1,140.00 · 52%");
  });

  it("shows B2CS, HSN and the invoice numbers used", async () => {
    stubRegister();
    renderPage();
    const b2cs = await screen.findByRole("region", { name: "By place of supply (B2CS)" });
    expect(within(b2cs).getAllByRole("row")[1]).toHaveTextContent("29-Karnataka5%₹2,085.71₹52.14₹52.15₹0.00");
    expect(within(screen.getByRole("region", { name: "HSN summary" })).getAllByRole("row")[1]).toHaveTextContent("61112₹2,085.71₹104.29₹2,190.00");
    expect(within(screen.getByRole("region", { name: "Invoice numbers used" })).getAllByRole("row")[1]).toHaveTextContent("CB/26-27/0001CB/26-27/000331");
    expect(screen.queryByRole("region", { name: "Inter-state over ₹1,00,000 (B2CL)" })).toBeNull();
  });

  it("lists invoices, greying a cancelled one with its note", async () => {
    stubRegister();
    renderPage();
    const list = await screen.findByRole("region", { name: "Invoices" });
    const rows = within(list).getAllByTestId("register-invoice");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("CB/26-27/0001");
    expect(rows[0]).toHaveTextContent("25-09-2026 · Asha Rao · Stall");
    expect(rows[0]).toHaveTextContent("₹1,050.00 · tax ₹50.00");
    expect(rows[2]).toHaveTextContent("Cancelled 28-09-2026 (was ₹1,050.00)");
    expect(rows[2].className).toMatch(/opacity-60/);
    expect(screen.queryByRole("region", { name: "Cancelled from earlier months" })).toBeNull();
  });

  it("lists earlier months' cancellations when there are any", async () => {
    const register = buildSalesRegister({
      month: "2026-09",
      orders: [],
      cancelledEarlier: [],
      missingNumbers: [],
      gstin: GSTIN,
      now: NOW,
    });
    register.cancelledEarlier = salesRegisterFixture().invoices.slice(2);
    stubRegister(() => json({ register }));
    renderPage();
    const earlier = await screen.findByRole("region", { name: "Cancelled from earlier months" });
    expect(earlier).toHaveTextContent("Cancelled 28-09-2026 · less ₹1,050.00");
  });

  it("puts one block per row at every width", async () => {
    stubRegister();
    renderPage();
    const list = await screen.findByRole("region", { name: "Invoices" });
    expect(list.parentElement!.className).not.toMatch(/\b\w+:grid-cols-/);
  });

  it("reads ?month= and marks an unfinished month", async () => {
    window.history.replaceState(null, "", "/admin/sales-register?month=2026-10");
    const f = stubRegister(() => json({ register: empty("2026-10") }));
    renderPage();
    expect(await screen.findByText("No invoices in Oct 2026")).toBeInTheDocument();
    expect(screen.getByText("The download still gives a nil register to file.")).toBeInTheDocument();
    expect(f).toHaveBeenCalledWith("/api/admin/sales-register?month=2026-10", expect.anything());
    expect(screen.getByText("Month not finished")).toBeInTheDocument();
  });

  it.each(["2026-08", "2026-13", "2026-11"])("falls back to the default month for a month with no register (%s)", async (month) => {
    window.history.replaceState(null, "", `/admin/sales-register?month=${month}`);
    const f = stubRegister();
    renderPage();
    await screen.findByText("01-09-2026 to 30-09-2026");
    expect(f).toHaveBeenCalledWith("/api/admin/sales-register?month=2026-09", expect.anything());
  });

  it("switches month from a chip and keeps it in the URL", async () => {
    const f = stubRegister((url) => json({ register: url.endsWith("2026-10") ? empty("2026-10") : salesRegisterFixture() }));
    renderPage();
    await screen.findByText("01-09-2026 to 30-09-2026");
    fireEvent.click(screen.getByRole("radio", { name: "Oct 2026 · so far" }));
    expect(await screen.findByText("No invoices in Oct 2026")).toBeInTheDocument();
    expect(f).toHaveBeenLastCalledWith("/api/admin/sales-register?month=2026-10", expect.anything());
    expect(window.location.search).toBe("?month=2026-10");
  });

  it("shows the warnings before anything else", async () => {
    const register = salesRegisterFixture();
    register.warnings = ["Paid orders with no invoice number: ORD-A"];
    stubRegister(() => json({ register }));
    renderPage();
    const warnings = await screen.findByRole("region", { name: "Warnings" });
    expect(warnings).toHaveTextContent("Check before sending");
    expect(warnings).toHaveTextContent("Paid orders with no invoice number: ORD-A");
  });

  it("shows the error banner with Retry when loading fails", async () => {
    stubRegister(() => json({ error: "Couldn't load the sales register" }, 500));
    renderPage();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the sales register"));
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("keeps the last register on screen when a refresh fails", async () => {
    let calls = 0;
    stubRegister(() => (calls++ === 0 ? json({ register: salesRegisterFixture() }) : json({ error: "Couldn't load the sales register" }, 500)));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderPage(qc);
    await screen.findByText("01-09-2026 to 30-09-2026");
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["admin", "sales-register", "2026-09"] });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the sales register");
    expect(tile("Invoice value")).toHaveTextContent("₹2,190.00");
  });

  it("lists shop invoices in their own table and adds them to the net", async () => {
    const { retailer, doc } = await import("@/lib/retail/__fixtures__/retail");
    const { orderRow } = await import("@/lib/gst/__fixtures__/register");
    const register = buildSalesRegister({
      month: "2026-09", orders: [orderRow()], cancelledEarlier: [], missingNumbers: [], gstin: GSTIN, now: NOW,
      retail: {
        invoices: [{ ...doc({ period: "2026-09", doc_date: "2026-09-30", number: "CBR/26-27/0001" }), retailers: retailer() }],
        challans: [{ number: "CBC/26-27/0001", status: "issued" }],
      },
    });
    stubRegister(() => json({ register }));
    renderPage();
    const shops = await screen.findByRole("region", { name: "Shops (B2B)" });
    expect(shops).toHaveTextContent("CBR/26-27/0001");
    expect(shops).toHaveTextContent("29AAGFC4321M1ZB");
    expect(tile("Invoice value")).toHaveTextContent("₹1,800.00");
    expect(within(tile("Net invoices")).getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Challan numbers used" })).toHaveTextContent("CBC/26-27/0001");
  });

  it("shows the challan numbers of a month with only challans", async () => {
    const register = buildSalesRegister({
      month: "2026-09", orders: [], cancelledEarlier: [], missingNumbers: [], gstin: GSTIN, now: NOW,
      retail: { invoices: [], challans: [{ number: "CBC/26-27/0001", status: "issued" }] },
    });
    stubRegister(() => json({ register }));
    renderPage();
    expect(await screen.findByRole("region", { name: "Challan numbers used" })).toHaveTextContent("CBC/26-27/0001");
  });
});
