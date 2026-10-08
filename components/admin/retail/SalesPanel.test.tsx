// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { balance, doc, line, retailer } from "@/lib/retail/__fixtures__/retail";
import { holdingsFrom } from "@/lib/retail/holdings";
import type { RetailerDetail } from "@/lib/retail/api-types";
import { SalesPanel } from "./SalesPanel";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const summary = { unitsHeld: 3, mrpValueHeldPaise: 300000, invoicedPaise: 0, paidPaise: 0, owedPaise: 0, lastReportedPeriod: null, amberBatches: 0, redBatches: 0, oldestSentOn: "2026-10-01" };

function detail(docs = [] as RetailerDetail["docs"]): RetailerDetail {
  return { retailer: retailer(), summary, holdings: holdingsFrom([balance()], "2026-11-08"), docs, payments: [], today: "2026-11-08" };
}

afterEach(() => vi.unstubAllGlobals());

describe("SalesPanel", () => {
  it("defaults to last month and links the sheet download", () => {
    render(<SalesPanel detail={detail()} onChanged={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Download sheet" })).toHaveAttribute("href", `/api/admin/retail/${retailer().id}/sheet?month=2026-10`);
  });

  it("lists row errors from an upload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Fix these rows in the sheet and upload it again", rowErrors: [{ row: 2, code: "petal-frock-1-2y", message: "Sold 9 of Petal Pops Frock (1-2Y) but the shop holds 3" }] }, 422)));
    render(<SalesPanel detail={detail()} onChanged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Upload filled sheet"), { target: { files: [new File(["x"], "s.xlsx")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Row 2: Sold 9 of Petal Pops Frock (1-2Y) but the shop holds 3");
  });

  it("previews a draft at 75% of MRP with GST and issues it", async () => {
    const draft = doc({ id: "d1", status: "draft", number: null, share_pct: null, period: "2026-10", consignment_lines: [line({ quantity: 2, batch_line_id: "batch-1" })] });
    const fetchMock = vi.fn(async () => json({ doc: { id: "d1" } }));
    vi.stubGlobal("fetch", fetchMock);
    const onChanged = vi.fn();
    render(<SalesPanel detail={detail([draft])} onChanged={onChanged} />);
    expect(screen.getByTestId("sale-preview")).toHaveTextContent("Total ₹1,500.00");
    expect(screen.getByTestId("sale-preview")).toHaveTextContent("CGST ₹35.71");
    fireEvent.click(screen.getByRole("button", { name: "Issue invoice" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/retail/docs/d1", expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "issue" }) }));
  });

  it("shows an issued month with its PDF and no upload", () => {
    render(<SalesPanel detail={detail([doc({ period: "2026-10" })])} onChanged={vi.fn()} />);
    expect(screen.getByText("Invoice CBR/26-27/0001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download PDF" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Upload filled sheet")).not.toBeInTheDocument();
  });
});
