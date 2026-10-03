import { NextResponse, type NextRequest } from "next/server";
import { GST_REGISTERED_FROM } from "@/lib/config/business";
import { getBusinessGstin } from "@/lib/config/gstin";
import { currentIstMonth, parseRegisterMonth } from "./register-month";

export const NO_STORE = { "Cache-Control": "private, no-store" };

export type RegisterRequest =
  | { ok: true; month: string; gstin: string; now: Date }
  | { ok: false; response: NextResponse };

/** The month and GSTIN for a register route. Call only after requireAdmin() has passed. */
export function readRegisterRequest(request: NextRequest, now: Date): RegisterRequest {
  const month = parseRegisterMonth(request.nextUrl.searchParams.get("month"), now);
  if (!month) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Pick a month from ${GST_REGISTERED_FROM} to ${currentIstMonth(now)} (YYYY-MM)` },
        { status: 400, headers: NO_STORE },
      ),
    };
  }
  try {
    return { ok: true, month, gstin: getBusinessGstin(), now };
  } catch (e) {
    console.error("[sales-register] BUSINESS_GSTIN misconfigured:", e instanceof Error ? e.message : e);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "The GSTIN is not configured, so no register can be made" },
        { status: 500, headers: NO_STORE },
      ),
    };
  }
}
