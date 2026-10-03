import { describe, expect, it } from "vitest";
import {
  cancellationNote,
  formatIstDate,
  formatIstDateTime,
  formatPaise,
  istDateCell,
  paiseToRupees,
  placeOfSupplyLabel,
  registerFileName,
} from "./register-format";

describe("register-format", () => {
  it("formats paise as rupees with two decimals, minus sign for negatives, never -0", () => {
    expect(formatPaise(123450)).toBe("₹1,234.50");
    expect(formatPaise(10_000_001)).toBe("₹1,00,000.01");
    expect(formatPaise(-123450)).toBe("-₹1,234.50");
    expect(formatPaise(-0)).toBe("₹0.00");
  });

  it("turns paise into a rupee number for a cell", () => {
    expect(paiseToRupees(208571)).toBe(2085.71);
    expect(Object.is(paiseToRupees(-0), -0)).toBe(false);
  });

  it("prints dates by the IST calendar day", () => {
    expect(formatIstDate("2026-09-30T18:29:00.000Z")).toBe("30-09-2026"); // 23:59 IST
    expect(formatIstDate("2026-09-30T18:31:00.000Z")).toBe("01-10-2026"); // 00:01 IST
    expect(formatIstDateTime("2026-10-03T08:35:00.000Z")).toBe("03-10-2026 14:05 IST");
  });

  it("builds a spreadsheet date at UTC midnight of the IST day", () => {
    expect(istDateCell("2026-09-30T18:29:00.000Z").toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(istDateCell("2026-09-30T18:31:00.000Z").toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("labels the place of supply with its code, or a dash when unknown", () => {
    expect(placeOfSupplyLabel({ code: "29", name: "Karnataka" })).toBe("29-Karnataka");
    expect(placeOfSupplyLabel({ code: null, name: "test" })).toBe("—");
  });

  it("writes the cancelled status note", () => {
    expect(cancellationNote("2026-09-28T10:00:00.000Z", 105000)).toBe("Cancelled 28-09-2026 (was ₹1,050.00)");
    expect(cancellationNote(null, 105000)).toBe("Cancelled, date not recorded (was ₹1,050.00)");
  });

  it("names the file by month, adding the last day for an unfinished month", () => {
    expect(registerFileName("2026-09", { to: "30-09-2026", unfinished: false })).toBe("cozyberries-sales-register-2026-09.xlsx");
    expect(registerFileName("2026-10", { to: "03-10-2026", unfinished: true })).toBe("cozyberries-sales-register-2026-10-upto-03.xlsx");
  });
});
