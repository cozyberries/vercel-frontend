// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";
import { attachmentName, RegisterDownloadButton } from "./RegisterDownloadButton";

const clicked: string[] = [];

beforeEach(() => {
  clicked.length = 0;
  URL.createObjectURL = vi.fn(() => "blob:register");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this.download);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const fileResponse = () =>
  new Response(new Uint8Array([80, 75, 3, 4]), {
    headers: { "Content-Disposition": 'attachment; filename="cozyberries-sales-register-2026-09.xlsx"' },
  });

describe("attachmentName", () => {
  it("reads the filename from Content-Disposition", () => {
    expect(attachmentName('attachment; filename="a.xlsx"')).toBe("a.xlsx");
    expect(attachmentName(null)).toBeNull();
    expect(attachmentName("attachment")).toBeNull();
  });
});

describe("RegisterDownloadButton", () => {
  it("fetches the month's file and saves it under the server's name", async () => {
    // shouldAdvanceTime keeps waitFor's polling working while the 60 s revoke timer stays under test control.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
    const f = vi.fn(async () => fileResponse());
    vi.stubGlobal("fetch", f);
    render(<RegisterDownloadButton month="2026-09" unfinished={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Download Excel" }));
    await waitFor(() => expect(clicked).toEqual(["cozyberries-sales-register-2026-09.xlsx"]));
    expect(f).toHaveBeenCalledWith("/api/admin/sales-register/download?month=2026-09", expect.objectContaining({ cache: "no-store" }));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:register");
  });

  it("disables itself with a spinner while the file is being made", async () => {
    let release: (r: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => (release = resolve))));
    render(<RegisterDownloadButton month="2026-09" unfinished={false} />);
    const button = screen.getByRole("button", { name: "Download Excel" });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(button.querySelector(".animate-spin")).not.toBeNull();
    await act(async () => release(fileResponse()));
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("shows the server's error in a toast and saves nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Couldn't download the register" }), { status: 500 })));
    render(<RegisterDownloadButton month="2026-09" unfinished={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Download Excel" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't download the register"));
    expect(clicked).toEqual([]);
  });

  it("says the month is not finished", () => {
    const { rerender } = render(<RegisterDownloadButton month="2026-10" unfinished />);
    expect(screen.getByText("Month not finished")).toBeInTheDocument();
    rerender(<RegisterDownloadButton month="2026-09" unfinished={false} />);
    expect(screen.queryByText("Month not finished")).toBeNull();
  });
});
