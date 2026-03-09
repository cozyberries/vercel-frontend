import { createHash } from "crypto";
import { NextResponse } from "next/server";
import {
  checkPincodeServiceability,
  stateCodeToName,
} from "@/lib/utils/shipping-helpers";
import { UpstashService } from "@/lib/upstash";

const PINCODE_RATE_LIMIT_PER_MINUTE = 60;

function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
    return fingerprintFallback(request);
  }
  if (realIp) {
    const r = realIp.trim();
    if (r) return r;
    return fingerprintFallback(request);
  }
  return fingerprintFallback(request);
}

function fingerprintFallback(request: Request): string {
  const ua = (request.headers.get("user-agent") ?? "").trim();
  const lang = (request.headers.get("accept-language") ?? "").trim();
  const reqId = (request.headers.get("x-request-id") ?? "").trim();
  if (!ua && !lang && !reqId) {
    console.warn("Pincode rate limit: no IP or fingerprint headers, using unknown bucket");
    return "unknown";
  }
  const combined = `${ua}:${lang}:${reqId}`;
  return createHash("sha256").update(combined, "utf8").digest("hex").slice(0, 24);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pincode = searchParams.get("pincode");

  if (!pincode || !/^\d{6}$/.test(pincode)) {
    return NextResponse.json(
      { error: "Invalid pincode. Must be 6 digits." },
      { status: 400 }
    );
  }

  const clientId = getClientIdentifier(request);
  try {
    const rateLimit = await UpstashService.checkRateLimit(
      `pincode_check:${clientId}`,
      PINCODE_RATE_LIMIT_PER_MINUTE,
      60
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again in a minute." },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
          },
        }
      );
    }
  } catch (rateLimitErr) {
    console.error("Pincode rate limit check failed, allowing request (fail-open):", rateLimitErr);
  }

  try {
    const result = await checkPincodeServiceability(pincode);

    return NextResponse.json({
      serviceable: result.serviceable,
      pincode: result.pincode,
      city: result.district,
      state: stateCodeToName(result.state_code),
      state_code: result.state_code,
      country: result.country_code === "IN" ? "India" : result.country_code,
      prepaid: result.prepaid,
      cod: result.cod,
      is_oda: result.is_oda,
      delivery_days: result.delivery_days,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Pincode check error:", message, err);
    const isConfigError = message.includes("DELIVERY_API_KEY") || message.includes("not set");
    const status = isConfigError ? 503 : 502;
    return NextResponse.json(
      { error: isConfigError ? "Pincode check is not configured. Please contact support." : "Unable to verify pincode. Please try again." },
      { status }
    );
  }
}
