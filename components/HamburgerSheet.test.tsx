// @vitest-environment jsdom
import type React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ isAdmin: false }));
vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => ({ user: { id: "u", email: "u@x.in" }, loading: false, signOut: vi.fn(), isAdmin: h.isAdmin }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/components/data-preloader", () => ({
  usePreloadedData: () => ({ categories: [], isLoading: false }),
}));
vi.mock("@/hooks/useApiQueries", () => ({
  useAgeOptions: () => ({ data: [], isError: false }),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));
vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get:
        (_t, tag: string) =>
        (props: Record<string, unknown>) => {
          const { children, whileHover, whileTap, variants, initial, animate, exit, ...rest } = props as Record<
            string,
            unknown
          > & { children?: React.ReactNode };
          const Tag = tag as keyof React.JSX.IntrinsicElements;
          return <Tag {...(rest as object)}>{children}</Tag>;
        },
    }
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { HamburgerSheet } from "./HamburgerSheet";

describe("HamburgerSheet admin entry", () => {
  it("shows one Admin item to admins and none of the old links", () => {
    h.isAdmin = true;
    render(<HamburgerSheet />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("link", { name: /^Admin$/ })).toHaveAttribute("href", "/admin");
    expect(screen.queryByText("Stall pickups")).not.toBeInTheDocument();
    expect(screen.queryByText("On-behalf orders")).not.toBeInTheDocument();
    expect(screen.queryByText("Impersonate user")).not.toBeInTheDocument();
  });

  it("shows no Admin item for a customer", () => {
    h.isAdmin = false;
    render(<HamburgerSheet />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.queryByRole("link", { name: /^Admin$/ })).not.toBeInTheDocument();
  });
});
