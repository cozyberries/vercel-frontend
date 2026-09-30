// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusPill, PageHeader, EmptyState, LoadingList, ErrorBanner } from "./index";

describe("StatusPill", () => {
  it("formats the status and uses the shared colour map", () => {
    render(<StatusPill status="ready_for_pickup" />);
    const pill = screen.getByText("Ready For Pickup");
    expect(pill.className).toContain("bg-teal-100");
  });
});

describe("PageHeader", () => {
  it("renders title, subtitle and the action slot", () => {
    render(<PageHeader title="Orders" subtitle="Last 7 days" action={<button>Scans</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Orders" })).toBeInTheDocument();
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scans" })).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("shows title and hint", () => {
    render(<EmptyState title="No orders match" hint="Try a wider date range" />);
    expect(screen.getByText("No orders match")).toBeInTheDocument();
    expect(screen.getByText("Try a wider date range")).toBeInTheDocument();
  });
});

describe("LoadingList", () => {
  it("is announced as a status with the given label and row count", () => {
    const { container } = render(<LoadingList rows={3} label="Loading orders" />);
    expect(screen.getByRole("status", { name: "Loading orders" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-skeleton-row]")).toHaveLength(3);
  });
});

describe("ErrorBanner", () => {
  it("shows the message and calls onRetry", () => {
    const onRetry = vi.fn();
    render(<ErrorBanner message="Couldn't refresh" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't refresh");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("offers a login link instead of retry when the session is gone", () => {
    render(<ErrorBanner message="Signed out" loginRedirect="/admin/orders" />);
    expect(screen.getByRole("link", { name: "Log in again" })).toHaveAttribute(
      "href",
      "/login?redirect=%2Fadmin%2Forders",
    );
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});
