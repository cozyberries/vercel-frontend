// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardClient from "./dashboard-client";

function renderWithQuery() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DashboardClient />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("DashboardClient", () => {
  it("shows the four action tiles with links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ actions: { awaiting: 3, to_ship: 5, ready_for_pickup: 2, collected_today: 6, generated_at: "t" }, cached: false }), { status: 200 })),
    );
    renderWithQuery();
    await waitFor(() => expect(screen.getByRole("link", { name: /Awaiting/ })).toHaveTextContent("3"));
    expect(screen.getByRole("link", { name: /Awaiting/ })).toHaveAttribute("href", "/admin/pickup-orders?tab=awaiting");
    expect(screen.getByRole("link", { name: /To ship/ })).toHaveAttribute("href", "/admin/orders?fulfilment=delivery&status=processing");
    expect(screen.getByRole("link", { name: /Ready for pickup/ })).toHaveAttribute("href", "/admin/pickup-orders?tab=ready");
    expect(screen.getByRole("link", { name: /Collected today/ })).toHaveTextContent("6");
  });

  it("shows the error banner with retry when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 })));
    renderWithQuery();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("boom"));
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows a login link instead of Retry when the fetch answers 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })));
    renderWithQuery();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Log in again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});
