import { describe, expect, it } from "vitest";
import { buildUpiPayUrl, readUpiPayee, upiAppLinks } from "./upi";

// The fields printed on IDFC FIRST Bank's merchant QR for cozyberries@idfcbank.
const MERCHANT_ENV = {
  UPI_ID: "cozyberries@idfcbank",
  UPI_PAYEE_NAME: "COZYBERRIES",
  UPI_MERCHANT_CODE: "5641",
  UPI_MERCHANT_ID: "MID10307037564",
  UPI_TERMINAL_ID: "TID10307037564A",
  UPI_ORG_ID: "180071",
};

describe("readUpiPayee", () => {
  it("strips the trailing newline that `vercel env pull` leaves on values", () => {
    const payee = readUpiPayee({
      ...MERCHANT_ENV,
      UPI_ID: "cozyberries@idfcbank\n",
      UPI_PAYEE_NAME: "COZYBERRIES\n",
      UPI_MERCHANT_CODE: "5641\n",
    });
    expect(payee).toEqual({
      upiId: "cozyberries@idfcbank",
      payeeName: "COZYBERRIES",
      merchant: { code: "5641", merchantId: "MID10307037564", terminalId: "TID10307037564A", orgId: "180071" },
    });
  });

  it("is null when the UPI ID or payee name is missing", () => {
    expect(readUpiPayee({ UPI_PAYEE_NAME: "COZYBERRIES" })).toBeNull();
    expect(readUpiPayee({ UPI_ID: "cozyberries@idfcbank", UPI_PAYEE_NAME: "  " })).toBeNull();
  });

  it("is null when the UPI ID is not a handle@bank address", () => {
    expect(readUpiPayee({ UPI_ID: "cozyberries idfcbank", UPI_PAYEE_NAME: "COZYBERRIES" })).toBeNull();
  });

  it("has no merchant block without a merchant category code", () => {
    expect(readUpiPayee({ UPI_ID: "someone@okaxis", UPI_PAYEE_NAME: "SOMEONE" })).toEqual({
      upiId: "someone@okaxis",
      payeeName: "SOMEONE",
      merchant: null,
    });
  });
});

describe("buildUpiPayUrl", () => {
  const merchant = readUpiPayee(MERCHANT_ENV)!;

  it("matches the merchant QR verified on 2026-10-02, plus amount, reference and note", () => {
    expect(
      buildUpiPayUrl(merchant, { amount: 2500, reference: "CBQR20261002112339", note: "Cozyberries Purchase" })
    ).toBe(
      "upi://pay?ver=01&mode=01&orgid=180071&pa=cozyberries@idfcbank&pn=COZYBERRIES&mc=5641" +
        "&mid=MID10307037564&mtid=TID10307037564A&qrMedium=04" +
        "&tr=CBQR20261002112339&am=2500.00&cu=INR&tn=Cozyberries%20Purchase"
    );
  });

  it("rounds to whole rupees, as the payment page shows the amount", () => {
    expect(buildUpiPayUrl(merchant, { amount: 1776.85, reference: "R1", note: "n" })).toContain("&am=1777.00&");
  });

  it("keeps only letters and digits of the order number in the reference", () => {
    expect(
      buildUpiPayUrl(merchant, { amount: 10, reference: "ORD-20260928-120000-00001", note: "n" })
    ).toContain("&tr=ORD2026092812000000001&");
  });

  it("caps the reference at 35 characters", () => {
    const url = buildUpiPayUrl(merchant, { amount: 10, reference: "A".repeat(50), note: "n" });
    expect(url).toContain(`&tr=${"A".repeat(35)}&`);
  });

  it("builds a plain person-to-person link when there is no merchant block", () => {
    const personal = readUpiPayee({ UPI_ID: "someone@okaxis", UPI_PAYEE_NAME: "SOME ONE" })!;
    expect(buildUpiPayUrl(personal, { amount: 499, reference: "R1", note: "Hi there" })).toBe(
      "upi://pay?pa=someone@okaxis&pn=SOME%20ONE&tr=R1&am=499.00&cu=INR&tn=Hi%20there"
    );
  });
});

describe("upiAppLinks", () => {
  it("opens the same payment in PhonePe, Google Pay and Paytm", () => {
    expect(upiAppLinks("upi://pay?pa=a@b&am=1.00")).toEqual({
      general: "upi://pay?pa=a@b&am=1.00",
      phonepe: "phonepe://pay?pa=a@b&am=1.00",
      gpay: "tez://upi/pay?pa=a@b&am=1.00",
      paytm: "paytmmp://pay?pa=a@b&am=1.00",
    });
  });
});
