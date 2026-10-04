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

  it("creates a customer without an OTP: no OTP button or field", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<ImpersonateClient />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Create new user" }));
    expect(screen.getByRole("button", { name: /Create & continue/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /OTP/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/OTP/)).not.toBeInTheDocument();
  });

  it("one tap creates the customer and starts impersonating them, with no OTP request", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/admin/users/create") {
        return new Response(JSON.stringify({ user: { id: "new-1" } }), { status: 201 });
      }
      // Stop before the page navigates away (jsdom cannot navigate).
      return new Response(JSON.stringify({ error: "start blocked in test" }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImpersonateClient />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Create new user" }));
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ayesha Khan" } });
    fireEvent.click(screen.getByRole("button", { name: /Create & continue/ }));

    await waitFor(() => expect(screen.getByText("start blocked in test")).toBeInTheDocument());
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual(["/api/admin/users/create", "/api/admin/impersonation/start"]);
    const createBody = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(createBody).toEqual({ email: "", phone: "9876543210", full_name: "Ayesha Khan" });
    const startBody = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(startBody).toEqual({ target_user_id: "new-1" });
  });

  it("offers to continue as the existing customer when the phone already has an account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "User already exists", existing_user_id: "old-1" }), { status: 409 })),
    );
    render(<ImpersonateClient />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Create new user" }));
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ayesha Khan" } });
    fireEvent.click(screen.getByRole("button", { name: /Create & continue/ }));

    await waitFor(() => expect(screen.getByText("This customer already has an account.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Continue as this customer" })).toBeInTheDocument();
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
