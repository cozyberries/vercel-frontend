// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StockClient, { stockRefetchInterval } from "./stock-client";
import { stockMetricsFixture } from "@/lib/admin/__fixtures__/stock-metrics";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function stubStock(respond: () => Response = () => json({ metrics: stockMetricsFixture() })) {
  const f = vi.fn(async () => respond());
  vi.stubGlobal("fetch", f);
  return f;
}

function renderPage(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={qc}>
      <StockClient />
    </QueryClientProvider>,
  );
}

const tile = (label: string) => screen.getByText(label).parentElement!;

beforeEach(() => {
  window.history.replaceState(null, "", "/admin/stock");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("StockClient", () => {
  it("loads /api/admin/stock and shows the time and the four tiles", async () => {
    const f = stubStock();
    renderPage();
    expect(await screen.findByText("as of 10:00")).toBeInTheDocument();
    expect(f).toHaveBeenCalledWith("/api/admin/stock", expect.objectContaining({ cache: "no-store" }));
    expect(tile("Units on hand")).toHaveTextContent("632");
    expect(tile("Stock value")).toHaveTextContent("₹4,70,374");
    expect(tile("Out of stock")).toHaveTextContent("18");
    expect(tile("Low (1–2 left)")).toHaveTextContent("65");
  });

  it("splits sizes into in stock, low and out in the health bar", async () => {
    stubStock();
    renderPage();
    const health = await screen.findByRole("region", { name: "Stock health" });
    expect(health).toHaveTextContent("In stock 104 · 55%");
    expect(health).toHaveTextContent("Low 65 · 35%");
    expect(health).toHaveTextContent("Out 18 · 10%");
  });

  it("shows restock, not selling, categories and size gaps", async () => {
    stubStock();
    renderPage();
    expect(await screen.findByRole("region", { name: "Restock next" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Not selling" })).toHaveTextContent("never sold");
    expect(within(screen.getByRole("region", { name: "Stock by category" })).getAllByRole("listitem")[0]).toHaveTextContent(
      "Boys Coord Sets248 units · ₹1,23,400",
    );
    expect(screen.getByRole("region", { name: "Size gaps" })).toHaveTextContent("Girls Coord Set Blue Daisy");
  });

  it("puts one block per row at every width", async () => {
    stubStock();
    renderPage();
    const restock = await screen.findByRole("region", { name: "Restock next" });
    expect(restock.parentElement!.className).not.toMatch(/\b\w+:grid-cols-/);
  });

  it("shows the empty states when nothing needs restocking and nothing is idle", async () => {
    stubStock(() => json({ metrics: stockMetricsFixture({ restock: [], not_selling: [] }) }));
    renderPage();
    expect(await screen.findByText("Nothing to restock — every size has 3 or more")).toBeInTheDocument();
    expect(screen.getByText("Every size in stock sold in the last 60 days")).toBeInTheDocument();
  });

  it("shows the error banner with Retry when loading fails", async () => {
    stubStock(() => json({ error: "Couldn't load stock" }, 500));
    renderPage();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load stock"));
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("keeps the last stock on screen when a refresh fails", async () => {
    let calls = 0;
    stubStock(() => (calls++ === 0 ? json({ metrics: stockMetricsFixture() }) : json({ error: "Couldn't load stock" }, 500)));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderPage(qc);
    expect(await screen.findByText("as of 10:00")).toBeInTheDocument();
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["admin", "stock"] });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load stock");
    expect(tile("Units on hand")).toHaveTextContent("632");
  });

  it("offers a login link instead of Retry on 401", async () => {
    stubStock(() => json({ error: "Unauthorized" }, 401));
    renderPage();
    await screen.findByRole("alert");
    expect(screen.getByRole("link", { name: "Log in again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("opens on Overview, with a Find tab", async () => {
    stubStock();
    renderPage();
    expect(await screen.findByRole("region", { name: "Restock next" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Find" })).toHaveAttribute("aria-selected", "false");
    expect(screen.queryByRole("region", { name: "Find stock" })).not.toBeInTheDocument();
  });

  it("switches to Find and back, keeping the view in the URL", async () => {
    stubStock();
    renderPage();
    await screen.findByRole("region", { name: "Restock next" });
    fireEvent.click(screen.getByRole("tab", { name: "Find" }));
    expect(screen.getByRole("region", { name: "Find stock" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Restock next" })).not.toBeInTheDocument();
    expect(window.location.search).toBe("?view=find");
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Gender" })).getByRole("radio", { name: "Girl" }));
    expect(window.location.search).toBe("?view=find&gender=girl");
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(window.location.search).toBe("");
    expect(screen.getByRole("region", { name: "Restock next" })).toBeInTheDocument();
  });

  it("opens straight into Find from a bookmarked link with its filters", async () => {
    window.history.replaceState(null, "", "/admin/stock?view=find&gender=girl&size=2-3y");
    stubStock();
    renderPage();
    expect(await screen.findByRole("region", { name: "Find stock" })).toBeInTheDocument();
    expect(within(screen.getByRole("radiogroup", { name: "Gender" })).getByRole("radio", { name: "Girl" })).toHaveAttribute("aria-checked", "true");
    expect(within(screen.getByRole("radiogroup", { name: "Size" })).getByRole("radio", { name: "2-3Y" })).toHaveAttribute("aria-checked", "true");
    expect(within(screen.getByRole("list", { name: "Girls Coord Set Blue Daisy sizes" })).getByRole("listitem")).toHaveTextContent("2-3Y—Out");
    expect(screen.queryByRole("list", { name: "Boys Coord Set Navy sizes" })).not.toBeInTheDocument();
  });

  it("ignores a bookmarked size that no longer exists", async () => {
    window.history.replaceState(null, "", "/admin/stock?view=find&size=9-10y");
    stubStock();
    renderPage();
    await screen.findByRole("region", { name: "Find stock" });
    expect(within(screen.getByRole("radiogroup", { name: "Size" })).getByRole("radio", { name: "Any" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /^Girls Coord Sets/ })).toBeInTheDocument();
  });

  it("refreshes every minute only while Find is open", () => {
    expect(stockRefetchInterval("find")).toBe(60_000);
    expect(stockRefetchInterval("overview")).toBe(false);
  });
});
