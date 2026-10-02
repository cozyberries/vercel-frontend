// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardClient from "./dashboard-client";
import { salesMetricsFixture } from "@/lib/admin/__fixtures__/sales-metrics";

const ACTIONS = { actions: { awaiting: 3, to_ship: 5, ready_for_pickup: 2, collected_today: 6, generated_at: "t" }, cached: false };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Answers the actions and sales endpoints separately; each call gets a fresh Response. */
function stubApi({
  actions = () => json(ACTIONS),
  sales = () => json({ metrics: salesMetricsFixture(), cached: false }),
}: { actions?: () => Response; sales?: () => Response } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => (String(input).startsWith("/api/admin/dashboard/sales") ? sales() : actions())),
  );
}

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function renderWithQuery() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DashboardClient />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DashboardClient", () => {
  it("shows the four action tiles with links", async () => {
    stubApi();
    renderWithQuery();
    await waitFor(() => expect(screen.getByRole("link", { name: /Awaiting/ })).toHaveTextContent("3"));
    expect(screen.getByRole("link", { name: /Awaiting/ })).toHaveAttribute("href", "/admin/pickup-orders?tab=awaiting");
    expect(screen.getByRole("link", { name: /To ship/ })).toHaveAttribute("href", "/admin/orders?fulfilment=delivery&status=processing&days=all");
    expect(screen.getByRole("link", { name: /Ready for pickup/ })).toHaveAttribute("href", "/admin/pickup-orders?tab=ready");
    expect(screen.getByRole("link", { name: /Collected today/ })).toHaveTextContent("6");
  });

  it("shows the Sales section below the tiles", async () => {
    stubApi();
    renderWithQuery();
    expect(await screen.findByRole("heading", { level: 2, name: "Sales" })).toBeInTheDocument();
    expect(await screen.findByText("₹24,310")).toBeInTheDocument();
  });

  it("shows the error banner with retry when the actions fetch fails", async () => {
    stubApi({ actions: () => json({ error: "boom" }, 500) });
    renderWithQuery();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("boom"));
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows a login link instead of Retry when the actions fetch answers 401", async () => {
    stubApi({ actions: () => json({ error: "Unauthorized" }, 401) });
    renderWithQuery();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Log in again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("keeps the action tiles when only the sales fetch fails", async () => {
    stubApi({ sales: () => json({ error: "Couldn't load sales" }, 500) });
    renderWithQuery();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load sales"));
    expect(screen.getByRole("link", { name: /Awaiting/ })).toHaveTextContent("3");
  });
});
