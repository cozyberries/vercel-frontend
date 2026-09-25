// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@/components/header", () => ({ default: () => <header data-testid="site-header" /> }));
vi.mock("@/components/footer", () => ({ default: () => null }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function BottomNav() {
      return <nav data-testid="bottom-nav" />;
    },
}));

import ConditionalLayout from "./ConditionalLayout";

function renderAt(pathname: string) {
  nav.pathname = pathname;
  return render(
    <ConditionalLayout>
      <p>page</p>
    </ConditionalLayout>,
  );
}

describe("ConditionalLayout", () => {
  it("renders the stall display without the site header or bottom nav", () => {
    renderAt("/display");
    expect(screen.getByText("page")).toBeInTheDocument();
    expect(screen.queryByTestId("site-header")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bottom-nav")).not.toBeInTheDocument();
  });

  it("keeps the header and bottom nav on shop pages", () => {
    renderAt("/products");
    expect(screen.getByTestId("site-header")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-nav")).toBeInTheDocument();
  });
});
