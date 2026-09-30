// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/supabase-auth-provider", () => ({ useAuth: () => ({ user: { id: "s" } }) }));

import AdminsClient from "./admins-client";

const admins = [
  { id: "s", email: "owner@x.in", phone: "9876543210", full_name: "Owner", role: "super_admin", created_at: "2026-01-01T00:00:00Z" },
  { id: "a", email: "asha@x.in", phone: null, full_name: "Asha", role: "admin", created_at: "2026-02-01T00:00:00Z" },
];

function mockFetch(routes: Record<string, (init?: RequestInit) => unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${url.split("?")[0]}`;
      const handler = routes[key];
      if (!handler) return new Response(JSON.stringify({ error: `no route ${key}` }), { status: 500 });
      return new Response(JSON.stringify(handler(init)), { status: 200 });
    }),
  );
}

function renderClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminsClient />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("AdminsClient", () => {
  it("lists admins; super_admin cards have no Remove button, the caller's card neither", async () => {
    mockFetch({ "GET /api/admin/admins": () => ({ admins }) });
    renderClient();
    await screen.findByText("asha@x.in");
    expect(screen.getByText("owner@x.in")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remove admin" })).toHaveLength(1);
  });

  it("removes an admin after confirming", async () => {
    const del = vi.fn(() => ({ ok: true }));
    mockFetch({ "GET /api/admin/admins": () => ({ admins }), "DELETE /api/admin/admins/a": del });
    renderClient();
    fireEvent.click(await screen.findByRole("button", { name: "Remove admin" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(del).toHaveBeenCalled());
  });

  it("searches and promotes a user", async () => {
    const post = vi.fn(() => ({ admin: { id: "u9", email: "new@x.in", phone: null, full_name: "New", role: "admin", created_at: "t" } }));
    mockFetch({
      "GET /api/admin/admins": () => ({ admins }),
      "GET /api/admin/users/search": () => ({ users: [{ id: "u9", email: "new@x.in", phone: null, full_name: "New", created_at: "t" }] }),
      "POST /api/admin/admins": post,
    });
    renderClient();
    fireEvent.click(await screen.findByRole("button", { name: "Add admin" }));
    fireEvent.change(screen.getByPlaceholderText("Email, phone, or name"), { target: { value: "new" } });
    fireEvent.click(await screen.findByRole("button", { name: "Make admin" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(JSON.parse(String(post.mock.calls[0][0]?.body))).toEqual({ user_id: "u9" });
  });

  it("never shows Remove on the caller's own card, even if their role is plain admin", async () => {
    const selfAsAdmin = [
      { id: "s", email: "owner@x.in", phone: "9876543210", full_name: "Owner", role: "admin", created_at: "2026-01-01T00:00:00Z" },
      { id: "a", email: "asha@x.in", phone: null, full_name: "Asha", role: "admin", created_at: "2026-02-01T00:00:00Z" },
    ];
    mockFetch({ "GET /api/admin/admins": () => ({ admins: selfAsAdmin }) });
    renderClient();
    await screen.findByText("asha@x.in");
    // Only Asha's card gets a Remove button; the caller's own card (id "s") never does.
    expect(screen.getAllByRole("button", { name: "Remove admin" })).toHaveLength(1);
  });

  it("shows 'Already an admin' instead of 'Make admin' for a search result who is already an admin", async () => {
    mockFetch({
      "GET /api/admin/admins": () => ({ admins }),
      "GET /api/admin/users/search": () => ({
        users: [{ id: "a", email: "asha@x.in", phone: null, full_name: "Asha", created_at: "2026-02-01T00:00:00Z" }],
      }),
    });
    renderClient();
    fireEvent.click(await screen.findByRole("button", { name: "Add admin" }));
    fireEvent.change(screen.getByPlaceholderText("Email, phone, or name"), { target: { value: "asha" } });
    await screen.findByText("Already an admin");
    expect(screen.queryByRole("button", { name: "Make admin" })).not.toBeInTheDocument();
  });

  it("shows 'Log in again' when the admins list request comes back 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })),
    );
    renderClient();
    await screen.findByRole("link", { name: "Log in again" });
  });

  it("Cancel in the remove sheet closes it without calling DELETE", async () => {
    const del = vi.fn(() => ({ ok: true }));
    mockFetch({ "GET /api/admin/admins": () => ({ admins }), "DELETE /api/admin/admins/a": del });
    renderClient();
    fireEvent.click(await screen.findByRole("button", { name: "Remove admin" }));
    await screen.findByRole("button", { name: "Remove" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument());
    expect(del).not.toHaveBeenCalled();
  });
});
