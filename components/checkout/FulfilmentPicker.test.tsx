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

  it("keeps one tab stop on the checked option", () => {
    render(<FulfilmentPicker value="pickup" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: /pick up from our stall/i })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: /home delivery/i })).toHaveAttribute("tabindex", "-1");
  });

  it("moves the choice with arrow keys, wrapping around", () => {
    const onChange = vi.fn();
    render(<FulfilmentPicker value="delivery" onChange={onChange} />);
    const delivery = screen.getByRole("radio", { name: /home delivery/i });
    fireEvent.keyDown(delivery, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("pickup");
    fireEvent.keyDown(delivery, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("pickup");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: /pick up from our stall/i }));
  });
});
