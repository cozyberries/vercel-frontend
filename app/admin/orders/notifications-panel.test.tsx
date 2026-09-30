// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NotificationsPanel from "./notifications-panel";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          notifications: [{ id: "n-1", title: "Scan", message: "Picked up", type: "shipment", read: false }],
          unread: 3,
        }),
        { status: 200 }
      )
    )
  );
});

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NotificationsPanel />
    </QueryClientProvider>
  );
}

describe("NotificationsPanel", () => {
  it("is collapsed by default and expands on click, showing the unread count", async () => {
    renderPanel();

    const toggle = await screen.findByRole("button", { name: /Delhivery scans/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(screen.queryByText("Picked up")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Picked up")).toBeInTheDocument();
  });
});
