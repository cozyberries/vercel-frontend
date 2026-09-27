// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import { toast } from "sonner";
import StallRefillsClient from "./stall-refills-client";
import type { RefillsResponse } from "@/lib/orders/stall-refills";

const UNDO_ID = "11111111-1111-4111-8111-111111111111";
const response = (): RefillsResponse => ({
  generated_at: "2026-09-27T06:00:00.000Z",
  today: {
    date: "2026-09-27",
    lines: [
      {
        key: "frock-moon-0-3m",
        variant_slug: "frock-moon-0-3m",
        name: "Moon and Stars - Sleeveless Muslin Cotton Frock",
        size: "0-3M",
        image: "https://x.supabase.co/storage/v1/object/public/media/products/frock-moon/1_thumbnail.webp",
        sold: 3,
        pending: 3,
        stock_now: 1,
        actions: [],
      },
      {
        key: "unmatched:old-frock:2-3y",
        variant_slug: null,
        name: "Old Frock",
        size: "2-3Y",
        image: null,
        sold: 1,
        pending: 1,
        stock_now: null,
        actions: [],
      },
      {
        key: "coords-rocket-3-4y",
        variant_slug: "coords-rocket-3-4y",
        name: "Rocket Ranger - Boys Co ord set",
        size: "3-4Y",
        image: null,
        sold: 1,
        pending: 0,
        stock_now: 5,
        actions: [
          { id: UNDO_ID, action: "refilled", quantity: 1, acted_by_name: "Asha", acted_at: "2026-09-27T09:00:00.000Z" },
        ],
      },
    ],
  },
  yesterday: {
    date: "2026-09-26",
    lines: [
      {
        key: "frock-petal-5-6y",
        variant_slug: "frock-petal-5-6y",
        name: "Petal Pops - Japanese Muslin Frock",
        size: "5-6Y",
        image: null,
        sold: 1,
        pending: 1,
        stock_now: 2,
        actions: [],
      },
    ],
  },
});

type Reply = { ok: boolean; status?: number; body: unknown };
let reply: (url: string, init?: RequestInit) => Reply;
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const r = reply(url, init);
  return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), json: async () => r.body };
});
const calls = (method?: string) => fetchMock.mock.calls.filter(([, init]) => init?.method === method);

beforeEach(() => {
  reply = () => ({ ok: true, body: response() });
  fetchMock.mockClear();
  vi.mocked(toast.error).mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StallRefillsClient />
    </QueryClientProvider>,
  );
}

describe("stall refills list", () => {
  it("shows today and yesterday with photo, sold and left", async () => {
    renderPage();
    const today = await screen.findByRole("region", { name: "Today" });
    expect(within(today).getByRole("heading", { name: "Today · Sun 27 Sep" })).toBeInTheDocument();
    expect(within(today).getByText("2 to refill · 1 done")).toBeInTheDocument();
    const moon = within(today).getByTestId("refill-line-frock-moon-0-3m");
    expect(within(moon).getByText("Left 1")).toBeInTheDocument();
    expect(within(moon).getByText(/Sold 3/)).toBeInTheDocument();
    expect(within(moon).getByRole("img", { name: "Moon and Stars - Sleeveless Muslin Cotton Frock" })).toHaveAttribute(
      "src",
      "https://x.supabase.co/storage/v1/object/public/media/products/frock-moon/1_thumbnail.webp",
    );
    const yesterday = screen.getByRole("region", { name: "Yesterday" });
    expect(within(yesterday).getByRole("heading", { name: "Yesterday · Sat 26 Sep" })).toBeInTheDocument();
    expect(within(yesterday).getByText("Petal Pops - Japanese Muslin Frock")).toBeInTheDocument();
  });

  it("Refilled posts that day's pending units and refetches", async () => {
    renderPage();
    const moon = await screen.findByTestId("refill-line-frock-moon-0-3m");
    fireEvent.click(within(moon).getByRole("button", { name: "Refilled" }));
    await waitFor(() => expect(calls("POST")).toHaveLength(1));
    const [url, init] = calls("POST")[0];
    expect(url).toBe("/api/admin/stall-refills");
    expect(JSON.parse(String(init?.body))).toEqual({
      sale_date: "2026-09-27",
      variant_slug: "frock-moon-0-3m",
      action: "refilled",
      quantity: 3,
    });
    await waitFor(() => expect(calls(undefined)).toHaveLength(2));
  });

  it("No stock left asks first: cancel sends nothing, confirm posts no_stock", async () => {
    renderPage();
    const petal = await screen.findByTestId("refill-line-frock-petal-5-6y");
    fireEvent.click(within(petal).getByRole("button", { name: "No stock left" }));
    let dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Set Petal Pops - Japanese Muslin Frock 5-6Y to 0?")).toBeInTheDocument();
    expect(within(dialog).getByText("It will show as out of stock on the website.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(calls("POST")).toHaveLength(0);

    fireEvent.click(within(petal).getByRole("button", { name: "No stock left" }));
    dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Set to 0" }));
    await waitFor(() => expect(calls("POST")).toHaveLength(1));
    expect(JSON.parse(String(calls("POST")[0][1]?.body))).toEqual({
      sale_date: "2026-09-26",
      variant_slug: "frock-petal-5-6y",
      action: "no_stock",
      quantity: 1,
    });
  });

  it("a handled line shows who and when, has no action buttons, and Undo calls DELETE", async () => {
    renderPage();
    const rocket = await screen.findByTestId("refill-line-coords-rocket-3-4y");
    expect(within(rocket).getByText("Refilled · 14:30 · Asha")).toBeInTheDocument();
    expect(within(rocket).queryByRole("button", { name: "Refilled" })).not.toBeInTheDocument();
    fireEvent.click(within(rocket).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(calls("DELETE")).toHaveLength(1));
    expect(calls("DELETE")[0][0]).toBe(`/api/admin/stall-refills/${UNDO_ID}`);
  });

  it("a line with no stock item shows a note and no buttons", async () => {
    renderPage();
    const line = await screen.findByTestId("refill-line-unmatched:old-frock:2-3y");
    expect(within(line).getByText("Not linked to a stock item")).toBeInTheDocument();
    expect(within(line).queryByRole("button")).not.toBeInTheDocument();
  });

  it("409 toasts 'Already handled on another phone' and refetches", async () => {
    reply = (_url, init) =>
      init?.method === "POST"
        ? { ok: false, status: 409, body: { error: "Already handled on another phone" } }
        : { ok: true, body: response() };
    renderPage();
    const moon = await screen.findByTestId("refill-line-frock-moon-0-3m");
    fireEvent.click(within(moon).getByRole("button", { name: "Refilled" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Already handled on another phone"));
    await waitFor(() => expect(calls(undefined)).toHaveLength(2));
  });

  it("a list left open past midnight toasts 'This list is out of date'", async () => {
    reply = (_url, init) =>
      init?.method === "POST"
        ? { ok: false, status: 400, body: { error: "sale_date must be today or yesterday", code: "STALE_DATE" } }
        : { ok: true, body: response() };
    renderPage();
    const moon = await screen.findByTestId("refill-line-frock-moon-0-3m");
    fireEvent.click(within(moon).getByRole("button", { name: "Refilled" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This list is out of date"));
  });

  it("a failed background refresh keeps the list and shows a banner", async () => {
    renderPage();
    await screen.findByTestId("refill-line-frock-moon-0-3m");
    reply = () => ({ ok: false, status: 500, body: { error: "Failed to load refills" } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Couldn't refresh, retrying")).toBeInTheDocument();
    expect(screen.getByTestId("refill-line-frock-moon-0-3m")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("a 401 on a background refresh shows the log-in prompt, not the refresh banner", async () => {
    renderPage();
    await screen.findByTestId("refill-line-frock-moon-0-3m");
    reply = () => ({ ok: false, status: 401, body: { error: "Unauthorized" } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Signed out. Log in again to see refills.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Log in again" });
    expect(link).toHaveAttribute("href", "/login?redirect=/admin/stall-refills");
    expect(screen.queryByText("Couldn't refresh, retrying")).not.toBeInTheDocument();
    expect(screen.getByTestId("refill-line-frock-moon-0-3m")).toBeInTheDocument();
  });

  it("a partly-handled line shows what's left, the prior action, and still offers both buttons", async () => {
    reply = () => ({
      ok: true,
      body: {
        ...response(),
        today: {
          date: "2026-09-27",
          lines: [
            {
              key: "coords-partial-2-3y",
              variant_slug: "coords-partial-2-3y",
              name: "Partial Set",
              size: "2-3Y",
              image: null,
              sold: 3,
              pending: 1,
              stock_now: 4,
              actions: [
                {
                  id: "22222222-2222-4222-8222-222222222222",
                  action: "refilled",
                  quantity: 2,
                  acted_by_name: "Asha",
                  acted_at: "2026-09-27T09:00:00.000Z",
                },
              ],
            },
          ],
        },
      },
    });
    renderPage();
    const line = await screen.findByTestId("refill-line-coords-partial-2-3y");
    expect(within(line).getByText("1 more to refill")).toBeInTheDocument();
    expect(within(line).getByText("Refilled ×2 · 14:30 · Asha")).toBeInTheDocument();
    expect(within(line).getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(within(line).getByRole("button", { name: "Refilled" })).toBeInTheDocument();
    expect(within(line).getByRole("button", { name: "No stock left" })).toBeInTheDocument();
    fireEvent.click(within(line).getByRole("button", { name: "Refilled" }));
    await waitFor(() => expect(calls("POST")).toHaveLength(1));
    expect(JSON.parse(String(calls("POST")[0][1]?.body))).toEqual({
      sale_date: "2026-09-27",
      variant_slug: "coords-partial-2-3y",
      action: "refilled",
      quantity: 1,
    });
  });

  it("an empty day says so", async () => {
    reply = () => ({ ok: true, body: { ...response(), today: { date: "2026-09-27", lines: [] } } });
    renderPage();
    expect(await screen.findByText("Nothing sold yet today.")).toBeInTheDocument();
  });
});
