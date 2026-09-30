// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { ListCard, ActionSheet } from "./index";

function matchMediaStub(matches: boolean) {
  return vi.fn().mockImplementation(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ListCard", () => {
  it("renders title, meta, status and actions, and opens on tap", () => {
    const onClick = vi.fn();
    render(
      <ListCard
        title="#ORD-1"
        meta="Priya · ₹1,240"
        status="processing"
        onClick={onClick}
        actions={<button>Collected</button>}
        testId="order-1"
      />,
    );
    expect(screen.getByTestId("order-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /#ORD-1/ }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collected" })).toBeInTheDocument();
  });

  it("renders no button when onClick is not provided", () => {
    render(
      <ListCard
        title="#ORD-2"
        meta="Kumar · ₹500"
        status="completed"
        testId="order-2"
      />,
    );
    expect(screen.getByTestId("order-2")).toBeInTheDocument();
    const buttons = screen.queryAllByRole("button");
    // Only the button inside actions would be present, but we're not passing actions here
    expect(buttons).toHaveLength(0);
  });

  it("applies opacity-60 class when dimmed is true", () => {
    render(
      <ListCard title="Dimmed Item" dimmed={true} testId="dimmed-item" />,
    );
    const listItem = screen.getByTestId("dimmed-item");
    expect(listItem).toHaveClass("opacity-60");
  });

  it("renders children when provided", () => {
    render(
      <ListCard title="With Children" testId="with-children">
        <p>Child content here</p>
      </ListCard>,
    );
    expect(screen.getByText("Child content here")).toBeInTheDocument();
  });
});

describe("ActionSheet", () => {
  it("renders as a bottom sheet with an accessible title on phones", () => {
    render(
      <ActionSheet open onOpenChange={() => {}} title="Order #1" description="Edit status">
        <p>body</p>
      </ActionSheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Order #1" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
    // Verify Sheet path: should have rounded-t-2xl for bottom sheet
    expect(dialog).toHaveClass("rounded-t-2xl");
  });

  it("renders no dialog when open is false", () => {
    render(
      <ActionSheet open={false} onOpenChange={() => {}} title="Order #2">
        <p>body</p>
      </ActionSheet>,
    );
    const dialogs = screen.queryAllByRole("dialog");
    expect(dialogs).toHaveLength(0);
  });

  it("renders description when provided", () => {
    render(
      <ActionSheet open onOpenChange={() => {}} title="Order #3" description="This is a description">
        <p>body</p>
      </ActionSheet>,
    );
    expect(screen.getByText("This is a description")).toBeInTheDocument();
  });

  it("uses sr-only description when description is not provided", () => {
    render(
      <ActionSheet open onOpenChange={() => {}} title="Order #4">
        <p>body</p>
      </ActionSheet>,
    );
    // The sr-only description should be present for accessibility
    // Since jsdom doesn't have matchMedia, ActionSheet renders the Sheet path with sr-only description
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // The dialog should have both a title and sr-only description with the same text
    const allOrder4s = screen.getAllByText("Order #4");
    expect(allOrder4s).toHaveLength(2); // one h2 title, one sr-only description
  });

  it("renders as a dialog on desktop (lg and up)", () => {
    vi.stubGlobal("matchMedia", matchMediaStub(true));
    render(
      <ActionSheet open onOpenChange={() => {}} title="Order #5">
        <p>body</p>
      </ActionSheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Order #5" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
    // Verify Dialog path: should have sm:max-w-lg but NOT rounded-t-2xl
    expect(dialog).toHaveClass("sm:max-w-lg");
    expect(dialog).not.toHaveClass("rounded-t-2xl");
  });
});
