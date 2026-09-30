// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROFILE_COMBINED_QUERY_KEY } from "@/hooks/useApiQueries";

const h = vi.hoisted(() => ({
  phone: null as string | null,
  refreshProfile: vi.fn(async () => {}),
  userOverride: undefined as { id: string } | null | undefined,
  impersonating: false,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => ({
    user: h.userOverride !== undefined ? h.userOverride : { id: "me" },
    refreshProfile: h.refreshProfile,
    impersonation: { active: h.impersonating },
  }),
}));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ profile: { phone: h.phone }, isLoading: false }) }));
// `@/hooks/useApiQueries` instantiates `orderService` (Supabase client) at module load,
// which throws without env vars in the test environment — mock it to the one export
// this component actually needs, same pattern as on-behalf-orders-client.test.tsx.
vi.mock("@/hooks/useApiQueries", () => ({ PROFILE_COMBINED_QUERY_KEY: ["profile", "combined"] as const }));

import PhoneLinkRow from "./PhoneLinkRow";

function renderRow() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <PhoneLinkRow />
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

beforeEach(() => {
  h.phone = null;
  h.refreshProfile.mockClear();
  h.userOverride = undefined;
  h.impersonating = false;
});
afterEach(() => vi.restoreAllMocks());

describe("PhoneLinkRow", () => {
  it("shows the current number with Change", () => {
    h.phone = "9876543210";
    renderRow();
    expect(screen.getByText(/98765 43210/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
  });

  it("sends an OTP with the link intent, then verifies, refreshes the profile and invalidates the cache", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init?.body)) });
        if (url.endsWith("/send")) return new Response(JSON.stringify({ verificationId: "v1", timeout: 60 }), { status: 200 });
        return new Response(JSON.stringify({ ok: true, phone: "9876543210" }), { status: 200 });
      }),
    );
    const { client } = renderRow();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(screen.getByRole("button", { name: "Add phone" }));
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));
    await screen.findByLabelText("OTP code");
    expect(calls[0]).toEqual({ url: "/api/auth/verifynow/send", body: { phone: "9876543210", intent: "link" } });
    fireEvent.change(screen.getByLabelText("OTP code"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(h.refreshProfile).toHaveBeenCalled());
    expect(calls[1]).toEqual({
      url: "/api/auth/verifynow/verify",
      body: { verificationId: "v1", code: "1234", intent: "link", phone: "9876543210" },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...PROFILE_COMBINED_QUERY_KEY, "me"] });
  });

  it("shows the API's message when the number is taken", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "This number is already on another account" }), { status: 409 })));
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Add phone" }));
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("already on another account"));
  });

  it("Cancel returns to idle without any fetch", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Add phone" }));
    expect(screen.getByLabelText("Phone number")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Phone number")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add phone" })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows a validation error for fewer than 10 digits and sends nothing", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Add phone" }));
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "98765" } });
    fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a 10-digit mobile number");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the API's message on a failed verify and stays on the code step", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/send")) return new Response(JSON.stringify({ verificationId: "v1", timeout: 60 }), { status: 200 });
        return new Response(JSON.stringify({ error: "Incorrect code" }), { status: 400 });
      }),
    );
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Add phone" }));
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));
    await screen.findByLabelText("OTP code");
    fireEvent.change(screen.getByLabelText("OTP code"), { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Incorrect code"));
    expect(screen.getByLabelText("OTP code")).toBeInTheDocument();
    expect(h.refreshProfile).not.toHaveBeenCalled();
  });

  it("shows an error and sends nothing when Verify is clicked with an empty code", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.endsWith("/send")) return new Response(JSON.stringify({ verificationId: "v1", timeout: 60 }), { status: 200 });
      return new Response(JSON.stringify({ ok: true, phone: "9876543210" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSpy);
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Add phone" }));
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));
    await screen.findByLabelText("OTP code");
    fetchSpy.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the code from the SMS");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders nothing while impersonating", () => {
    h.phone = "9876543210";
    h.impersonating = true;
    const { container } = renderRow();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there is no signed-in user", () => {
    h.userOverride = null;
    const { container } = renderRow();
    expect(container).toBeEmptyDOMElement();
  });
});
