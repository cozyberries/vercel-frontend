// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FulfilmentPicker } from "./FulfilmentPicker";

describe("FulfilmentPicker", () => {
  it("offers delivery and stall pickup as a radio group", () => {
    render(<FulfilmentPicker value="delivery" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: /home delivery/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /pick up from our stall/i })).toHaveAttribute("aria-checked", "false");
  });

  it("reports the choice", () => {
    const onChange = vi.fn();
    render(<FulfilmentPicker value="delivery" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /pick up from our stall/i }));
    expect(onChange).toHaveBeenCalledWith("pickup");
  });
});
