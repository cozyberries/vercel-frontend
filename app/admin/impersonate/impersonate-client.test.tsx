// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => ({ refreshImpersonation: vi.fn(async () => {}) }),
}));

import ImpersonateClient from "./impersonate-client";

afterEach(() => vi.restoreAllMocks());

describe("ImpersonateClient", () => {
  it("renders inline with both tabs and searches after two characters", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ users: [{ id: "u1", email: "p@x.in", phone: "9876543210", full_name: "Priya", created_at: "2026-01-01" }] }), { status: 200 })),
    );
    render(<ImpersonateClient />);
    expect(screen.getByRole("heading", { level: 1, name: "Impersonate user" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Find user" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Create new user" })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Email, phone, or name (min 2 chars)"), { target: { value: "pr" } });
    await waitFor(() => expect(screen.getByText("Priya")).toBeInTheDocument());
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/api/admin/users/search?");
  });

  it("shows the Send OTP button on the Create new user tab", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<ImpersonateClient />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Create new user" }));
    expect(screen.getByRole("button", { name: /Send OTP/ })).toBeInTheDocument();
  });

  it("does not call fetch for a one-character search", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ImpersonateClient />);
    fireEvent.change(screen.getByPlaceholderText("Email, phone, or name (min 2 chars)"), { target: { value: "p" } });
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
