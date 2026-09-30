// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const stop = vi.fn(async () => {});
const h = vi.hoisted(() => ({
  active: true,
  target: { full_name: "Priya", email: "p@x.in" } as { full_name: string | null; email: string | null } | null,
}));
vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => ({
    impersonation: { active: h.active, target: h.target },
    stopImpersonation: stop,
  }),
}));

import { ImpersonationBanner } from "./impersonation-banner";

describe("ImpersonationBanner exit", () => {
  it("stops impersonating and returns to the on-behalf list", async () => {
    h.active = true;
    h.target = { full_name: "Priya", email: "p@x.in" };
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { assign }, writable: true });
    render(<ImpersonationBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Exit" }));
    await waitFor(() => expect(stop).toHaveBeenCalled());
    expect(assign).toHaveBeenCalledWith("/admin/on-behalf-orders");
  });

  it("renders nothing when impersonation is inactive", () => {
    h.active = false;
    h.target = null;
    const { container } = render(<ImpersonationBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
