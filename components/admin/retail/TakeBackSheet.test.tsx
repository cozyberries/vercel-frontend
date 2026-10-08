// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { balance, retailer } from "@/lib/retail/__fixtures__/retail";
import type { RetailerDetail } from "@/lib/retail/api-types";
import { holdingsFrom } from "@/lib/retail/holdings";
import { TakeBackSheet } from "./TakeBackSheet";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const DRAFT = "22222222-2222-4222-8222-222222222222";
const summary = { unitsHeld: 3, mrpValueHeldPaise: 300000, invoicedPaise: 0, paidPaise: 0, owedPaise: 0, lastReportedPeriod: null, amberBatches: 0, redBatches: 0, oldestSentOn: "2026-10-01" };
const detail: RetailerDetail = { retailer: retailer(), summary, holdings: holdingsFrom([balance()], "2026-11-08"), docs: [], payments: [], today: "2026-11-08" };

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("TakeBackSheet", () => {
  it("offers dates from the first open GST month up to today", () => {
    render(<TakeBackSheet detail={detail} open onOpenChange={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByLabelText("Date received")).toHaveAttribute("min", "2026-10-01");
    expect(screen.getByLabelText("Date received")).toHaveAttribute("max", "2026-11-08");
  });

  it("reuses the draft when issuing is retried after a failure", async () => {
    let issues = 0;
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith("/docs")) return json({ doc_id: DRAFT });
      issues += 1;
      return issues === 1 ? json({ error: "The shop doesn't hold that many" }, 409) : json({ doc: { id: DRAFT } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<TakeBackSheet detail={detail} open onOpenChange={vi.fn()} onDone={vi.fn()} />);
    fireEvent.change(screen.getAllByRole("spinbutton", { name: /^Returning/ })[0], { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Take back" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("doesn't hold");
    fireEvent.click(screen.getByRole("button", { name: "Take back" }));
    await waitFor(() => expect(issues).toBe(2));
    const docPosts = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/docs")).map(([, i]) => JSON.parse(String(i?.body)));
    expect(docPosts).toHaveLength(2);
    expect(docPosts[0].doc_id ?? null).toBeNull();
    expect(docPosts[1].doc_id).toBe(DRAFT);
  });
});
