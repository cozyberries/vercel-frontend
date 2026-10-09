import { CLOSED_MONTH_ERROR, DISCOUNT_ERROR } from "./requests";

/** Maps a consignment_* function error (P0001 message) to an HTTP status and a message for the admin. */
export function retailRpcError(message: string): { status: number; error: string } {
  const [code, ...rest] = message.split(":");
  const tail = rest.join(":");
  switch (code) {
    case "NOT_FOUND":
      return { status: 404, error: "Not found" };
    case "RETAILER_INACTIVE":
      return { status: 409, error: "This shop is inactive, so no stock can be sent" };
    case "BAD_DATE":
      return { status: 400, error: "The date can't be in the future" };
    case "CLOSED_MONTH":
      return { status: 400, error: CLOSED_MONTH_ERROR };
    case "BAD_PERIOD":
      return { status: 400, error: "Pick a month up to this one" };
    case "NO_LINES":
      return { status: 400, error: "Add at least one item" };
    case "BAD_LINE":
      return { status: 400, error: "Each item needs a whole quantity" };
    case "UNKNOWN_VARIANT":
      return { status: 400, error: `Unknown product size: ${tail}` };
    case "OUT_OF_STOCK":
      return { status: 409, error: `Not enough stock of ${tail}` };
    case "NOT_HELD": {
      const [held, ...label] = rest;
      return { status: 409, error: `The shop holds only ${held} of ${label.join(":")}` };
    }
    case "NOT_DRAFT":
      return { status: 409, error: "This is no longer a draft: refresh the page" };
    case "ALREADY_ISSUED":
      return { status: 409, error: "That month's invoice is already issued" };
    case "ALREADY_CANCELLED":
      return { status: 409, error: "Already cancelled" };
    case "IN_USE":
      return { status: 409, error: "Sales or returns already draw on this challan, so it can't be cancelled" };
    case "STOCK_GONE":
      return { status: 409, error: `Those pieces of ${tail} have left your stock again` };
    case "ABOVE_LOW_RATE":
      return { status: 409, error: `A piece of ${tail} would be invoiced above ₹2,500, which is taxed at 18%: ask your CA before issuing` };
    case "TOO_LATE":
      return { status: 409, error: "That month is closed for GST (GSTR-1 is due on the 11th). A credit note is needed: ask your CA." };
    case "BAD_RATE":
      return { status: 400, error: DISCOUNT_ERROR };
    case "TOO_MANY_RATES":
      return { status: 409, error: "A month can have at most 4 discount rates" };
    case "RATE_IN_USE":
      return { status: 409, error: `The draft has sales at ${tail}% off. Change the draft first` };
    case "RATE_NOT_APPROVED":
      return { status: 409, error: `${tail}% isn't an approved discount for this month` };
    default:
      return { status: 500, error: "Couldn't save" };
  }
}
