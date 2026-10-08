import { describe, expect, it } from "vitest";
import { retailRpcError } from "./rpc-errors";

describe("retailRpcError", () => {
  it.each([
    ["NOT_FOUND", 404, "Not found"],
    ["RETAILER_INACTIVE", 409, "This shop is inactive, so no stock can be sent"],
    ["BAD_DATE", 400, "The date can't be in the future"],
    ["BAD_PERIOD", 400, "Pick a month up to this one"],
    ["NO_LINES", 400, "Add at least one item"],
    ["BAD_LINE", 400, "Each item needs a whole quantity"],
    ["UNKNOWN_VARIANT:frock-x", 400, "Unknown product size: frock-x"],
    ["OUT_OF_STOCK:Petal Pops Frock 1-2Y", 409, "Not enough stock of Petal Pops Frock 1-2Y"],
    ["NOT_HELD:2:Petal Pops Frock 1-2Y", 409, "The shop holds only 2 of Petal Pops Frock 1-2Y"],
    ["NOT_DRAFT", 409, "This is no longer a draft: refresh the page"],
    ["ALREADY_ISSUED", 409, "That month's invoice is already issued"],
    ["ALREADY_CANCELLED", 409, "Already cancelled"],
    ["IN_USE", 409, "Sales or returns already draw on this challan, so it can't be cancelled"],
    ["STOCK_GONE:Petal Pops Frock 1-2Y", 409, "Those pieces of Petal Pops Frock 1-2Y have left your stock again"],
    ["CLOSED_MONTH", 400, "That month is closed for GST: use a date in an open month"],
    ["ABOVE_LOW_RATE:Petal Pops Frock 1-2Y", 409, "A piece of Petal Pops Frock 1-2Y would be invoiced above ₹2,500, which is taxed at 18%: ask your CA before issuing"],
    ["TOO_LATE", 409, "That month is closed for GST (GSTR-1 is due on the 11th). A credit note is needed: ask your CA."],
    ["something odd", 500, "Couldn't save"],
  ])("%s → %i", (message, status, error) => {
    expect(retailRpcError(message)).toEqual({ status, error });
  });
});
