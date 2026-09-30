// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("@/hooks/useApiQueries", () => ({
  ON_BEHALF_ORDERS_PAGE_SIZE: 25,
  useOnBehalfOrders: vi.fn(() => h.state),
}));

import OnBehalfOrdersClient from "./on-behalf-orders-client";
import { useOnBehalfOrders } from "@/hooks/useApiQueries";

const order = {
  id: "o1",
  order_number: "ORD-1",
  status: "processing",
  total_amount: 1240,
  currency: "INR",
  created_at: "2026-09-30T05:00:00Z",
  customer: { email: "p@x.in", full_name: "Priya" },
  placed_by_admin: { email: "asha@cozyberries.in", full_name: "Asha" },
};

describe("OnBehalfOrdersClient", () => {
  it("renders list cards and opens the detail sheet", () => {
    h.state = { data: { orders: [order], total: 1 }, isPending: false, isFetching: false, error: null, refetch: vi.fn() };
    render(<OnBehalfOrdersClient />);
    fireEvent.click(screen.getByRole("button", { name: /#ORD-1/ }));
    const sheet = screen.getByRole("dialog", { name: "#ORD-1" });
    expect(sheet).toHaveTextContent("Priya");
    expect(sheet).toHaveTextContent("Asha");
  });

  it("shows the empty state pointing at Impersonate", () => {
    h.state = { data: { orders: [], total: 0 }, isPending: false, isFetching: false, error: null, refetch: vi.fn() };
    render(<OnBehalfOrdersClient />);
    expect(screen.getByText("No orders placed on behalf yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Impersonate a user" })).toHaveAttribute("href", "/admin/impersonate");
  });

  it("shows the error banner with retry", () => {
    const refetch = vi.fn();
    h.state = { data: undefined, isPending: false, isFetching: false, error: new Error("nope"), refetch };
    render(<OnBehalfOrdersClient />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("a failed first load shows the banner, not the empty state", () => {
    h.state = { data: undefined, isPending: false, isFetching: false, error: new Error("Database unavailable"), refetch: vi.fn() };
    render(<OnBehalfOrdersClient />);
    expect(screen.getByRole("alert")).toHaveTextContent("Database unavailable");
    expect(screen.queryByText("No orders placed on behalf yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log in again" })).not.toBeInTheDocument();
  });

  it("a 401 shows Log in again back to this page", () => {
    const error = Object.assign(new Error("Unauthorized"), { status: 401 });
    h.state = { data: undefined, isPending: false, isFetching: false, error, refetch: vi.fn() };
    render(<OnBehalfOrdersClient />);
    expect(screen.getByRole("link", { name: "Log in again" })).toHaveAttribute(
      "href",
      "/login?redirect=%2Fadmin%2Fon-behalf-orders"
    );
  });

  it("a 403 also shows Log in again", () => {
    const error = Object.assign(new Error("Forbidden"), { status: 403 });
    h.state = { data: { orders: [order], total: 1 }, isPending: false, isFetching: false, error, refetch: vi.fn() };
    render(<OnBehalfOrdersClient />);
    expect(screen.getByRole("link", { name: "Log in again" })).toBeInTheDocument();
  });

  it("a failed refresh keeps the previous rows visible under the banner", () => {
    const refetch = vi.fn();
    h.state = {
      data: { orders: [order], total: 1 },
      isPending: false,
      isFetching: false,
      error: Object.assign(new Error("Network error"), { status: 503 }),
      refetch,
    };
    render(<OnBehalfOrdersClient />);
    expect(screen.getByRole("alert")).toHaveTextContent("Network error");
    expect(screen.getByTestId("on-behalf-o1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /#ORD-1/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the loading state", () => {
    h.state = { data: undefined, isPending: true, isFetching: true, error: null, refetch: vi.fn() };
    render(<OnBehalfOrdersClient />);
    expect(screen.getByRole("status", { name: "Loading on-behalf orders" })).toBeInTheDocument();
  });

  it("disables Previous at offset 0 and Next once the page reaches the total", () => {
    h.state = { data: { orders: [order], total: 1 }, isPending: false, isFetching: false, error: null, refetch: vi.fn() };
    render(<OnBehalfOrdersClient />);
    expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
  });

  it("enables Next when more pages remain, and requests the next page on click", () => {
    const order2 = { ...order, id: "o2", order_number: "ORD-2" };
    h.state = {
      data: { orders: [order, order2], total: 30 },
      isPending: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    };
    render(<OnBehalfOrdersClient />);
    const nextButton = screen.getByRole("button", { name: /Next/ });
    expect(nextButton).not.toBeDisabled();
    fireEvent.click(nextButton);
    expect(vi.mocked(useOnBehalfOrders)).toHaveBeenCalledWith(25, 25);
  });
});
