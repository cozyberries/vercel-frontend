// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { retailer } from "@/lib/retail/__fixtures__/retail";
import { RetailerForm } from "./RetailerForm";

// jsdom has no ResizeObserver, which the Radix Switch needs.
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

describe("RetailerForm", () => {
  it("names the state from a valid GSTIN and flags a bad one", () => {
    render(<RetailerForm submitLabel="Add shop" onSubmit={vi.fn()} />);
    const gstin = screen.getByLabelText("GSTIN");
    fireEvent.change(gstin, { target: { value: "29AAGFC4321M1ZB" } });
    expect(screen.getByText("Karnataka (29)")).toBeInTheDocument();
    fireEvent.change(gstin, { target: { value: "29AAGFC4321M1ZC" } });
    expect(screen.getByText("This GSTIN's last character doesn't match: check for a typo")).toBeInTheDocument();
  });

  it("submits the fields with the share as a number and shows a server error", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("A shop with this GSTIN already exists"));
    render(<RetailerForm submitLabel="Add shop" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Legal name"), { target: { value: "Kids Corner LLP" } });
    fireEvent.change(screen.getByLabelText("GSTIN"), { target: { value: "29AAGFC4321M1ZB" } });
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "12 MG Road" } });
    fireEvent.change(screen.getByLabelText("Our share (%)"), { target: { value: "72.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add shop" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ legal_name: "Kids Corner LLP", gstin: "29AAGFC4321M1ZB", address: "12 MG Road", our_share_pct: 72.5, active: true });
    expect(await screen.findByRole("alert")).toHaveTextContent("A shop with this GSTIN already exists");
  });
  it("edit mode submits every field, keeping active and the share as loaded", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const initial = retailer({ active: false, our_share_pct: 60 });
    render(<RetailerForm initial={initial} submitLabel="Save" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const body = onSubmit.mock.calls[0][0];
    expect(body).toMatchObject({ legal_name: initial.legal_name, gstin: initial.gstin, address: initial.address, active: false, our_share_pct: 60 });
    for (const k of ["legal_name", "trade_name", "gstin", "address", "email", "phone", "our_share_pct", "active"]) expect(body).toHaveProperty(k);
  });
});
