// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

// useApiQueries builds API/Supabase clients at module load; the hook under test needs neither.
vi.mock("@/lib/services/api", () => ({}));
vi.mock("@/lib/services/orders", () => ({ orderService: {} }));

import { useOnBehalfOrders } from "./useApiQueries";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => vi.unstubAllGlobals());

describe("useOnBehalfOrders", () => {
  it("throws an Error carrying the response status and the body's message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })),
    );
    const { result } = renderHook(() => useOnBehalfOrders(0, 25), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Unauthorized");
    expect((result.current.error as Error & { status?: number }).status).toBe(401);
  });

  it("falls back to a status message when the body has none", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 502 })));
    const { result } = renderHook(() => useOnBehalfOrders(0, 25), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Request failed (502)");
    expect((result.current.error as Error & { status?: number }).status).toBe(502);
  });
});
