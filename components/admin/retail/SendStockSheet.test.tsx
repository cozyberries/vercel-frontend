// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SendStockSheet } from "./SendStockSheet";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const DRAFT = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("SendStockSheet", () => {
  it("reuses the draft when issuing is retried after a failure", async () => {
    let issues = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/retail/variants") return json({ variants: [{ slug: "petal-frock-1-2y", productName: "Petal Frock", size: "1-2Y", pricePaise: 100000, stock: 5 }] });
      if (url.endsWith("/docs")) return json({ doc_id: DRAFT });
      issues += 1;
      return issues === 1 ? json({ error: "Not enough stock" }, 409) : json({ doc: { id: DRAFT } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><SendStockSheet retailerId="r1" today="2026-11-08" open onOpenChange={vi.fn()} onDone={onDone} /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /Petal Frock \(1-2Y\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Issue challan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not enough stock");
    fireEvent.click(screen.getByRole("button", { name: "Issue challan" }));
    await waitFor(() => expect(issues).toBe(2));
    const docPosts = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/docs")).map(([, i]) => JSON.parse(String(i?.body)));
    expect(docPosts).toHaveLength(2);
    expect(docPosts[0].doc_id ?? null).toBeNull();
    expect(docPosts[1].doc_id).toBe(DRAFT);
  });
});
