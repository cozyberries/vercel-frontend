import { describe, expect, it } from "vitest";
import { amountInWords } from "./amount-in-words";

describe("amountInWords (Indian numbering)", () => {
  it.each([
    [0, "Rupees Zero Only"],
    [100, "Rupees One Only"],
    [1_500_00, "Rupees One Thousand Five Hundred Only"],
    [1_00_000_00, "Rupees One Lakh Only"],
    [12_34_567_89, "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Eighty Nine Paise Only"],
    [2_10_00_005_00, "Rupees Two Crore Ten Lakh Five Only"],
    [1_050_50, "Rupees One Thousand Fifty and Fifty Paise Only"],
    [19_00, "Rupees Nineteen Only"],
  ])("%i paise → %s", (paise, words) => {
    expect(amountInWords(paise)).toBe(words);
  });

  it("rejects fractional or negative paise", () => {
    expect(() => amountInWords(10.5)).toThrow();
    expect(() => amountInWords(-1)).toThrow();
  });
});
