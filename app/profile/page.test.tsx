// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ isAdmin: false }));
vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => ({ user: { id: "u", email: "u@x.in" }, isAdmin: h.isAdmin, signOut: vi.fn(), refreshProfile: vi.fn() }),
}));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ profile: { full_name: "Asha", phone: null }, isLoading: false }) }));
vi.mock("@/components/AccountMenuList", () => ({ default: () => null }));
vi.mock("@/components/profile/PhoneLinkRow", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import ProfilePage from "./page";

describe("profile page admin entry", () => {
  it("shows one Open admin row to admins", () => {
    h.isAdmin = true;
    render(<ProfilePage />);
    expect(screen.getByRole("link", { name: /Open admin/ })).toHaveAttribute("href", "/admin");
    expect(screen.queryByText("Impersonate user")).not.toBeInTheDocument();
    expect(screen.queryByText("Stall refills")).not.toBeInTheDocument();
  });

  it("shows nothing admin-related to customers", () => {
    h.isAdmin = false;
    render(<ProfilePage />);
    expect(screen.queryByRole("link", { name: /Open admin/ })).not.toBeInTheDocument();
  });
});
