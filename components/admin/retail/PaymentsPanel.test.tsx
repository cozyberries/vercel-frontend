// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { retailer } from "@/lib/retail/__fixtures__/retail";
import type { RetailerDetail } from "@/lib/retail/api-types";
import { PaymentsPanel } from "./PaymentsPanel";

const summary = { unitsHeld: 0, mrpValueHeldPaise: 0, invoicedPaise: 0, paidPaise: 0, owedPaise: 0, lastReportedPeriod: null, amberBatches: 0, redBatches: 0, oldestSentOn: null };
const detail: RetailerDetail = { retailer: retailer(), summary, holdings: [], docs: [], payments: [], today: "2026-11-08" };

afterEach(() => vi.unstubAllGlobals());

describe("PaymentsPanel", () => {
  it("sends one POST when Save payment is tapped twice before the first resolves", async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
    vi.stubGlobal("fetch", fetchMock);
    const onChanged = vi.fn();
    render(<PaymentsPanel detail={detail} onChanged={onChanged} />);
    fireEvent.change(screen.getByLabelText("Amount (₹)"), { target: { value: "500" } });
    const save = screen.getByRole("button", { name: "Save payment" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(save).toBeDisabled();
    resolve(new Response(JSON.stringify({}), { status: 200 }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(save).not.toBeDisabled());
  });
});
