// Drains the webhook_events queue. Called by the QStash schedule (signature
// verified) or manually with the INTERNAL_JOB_TOKEN HMAC headers. No session —
// the signature is the authorisation (CLAUDE.md service-role register).
import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { Receiver } from "@upstash/qstash";
import { processWebhookEventBatch } from "@/lib/services/webhook-processor";

export const runtime = "nodejs";

const TIMEOUT_MS = 20_000;
const MAX_TS_SKEW_MS = 5 * 60_000;

function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

async function verifyQstash(request: NextRequest, body: string): Promise<NextResponse | null> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) {
    return NextResponse.json(
      { ok: false, error: { code: "QSTASH_KEYS_MISSING", message: "QStash signing keys unset" } },
      { status: 500 }
    );
  }
  const receiver = new Receiver({ currentSigningKey, nextSigningKey });
  const valid = await receiver
    .verify({
      signature: request.headers.get("upstash-signature") || "",
      body,
      clockTolerance: 60,
    })
    .catch(() => false);
  if (!valid) {
    return NextResponse.json({ ok: false, error: { code: "BAD_SIGNATURE", message: "Invalid QStash signature" } }, { status: 401 });
  }
  return null;
}

function verifyInternal(request: NextRequest): NextResponse | null {
  const secret = process.env.INTERNAL_JOB_TOKEN?.trim();
  const token = request.headers.get("x-internal-job-token");
  const ts = request.headers.get("x-job-ts");
  const sig = request.headers.get("x-job-sig");
  const unauthorized = NextResponse.json(
    { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid internal job auth" } },
    { status: 401 }
  );
  if (!secret || !token || !ts || !sig) return unauthorized;
  if (!constantTimeEqual(token, secret)) return unauthorized;
  const tsMs = parseInt(ts, 10);
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > MAX_TS_SKEW_MS) return unauthorized;
  const expected = createHmac("sha256", secret)
    .update(`${ts}:${request.nextUrl.pathname}`)
    .digest("hex");
  if (!constantTimeEqual(sig, expected)) return unauthorized;
  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const denied = request.headers.has("upstash-signature")
    ? await verifyQstash(request, body)
    : verifyInternal(request);
  if (denied) return denied;

  try {
    const result = await Promise.race([
      processWebhookEventBatch(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("PROCESSOR_TIMEOUT")), TIMEOUT_MS)
      ),
    ]);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = message === "PROCESSOR_TIMEOUT" ? "PROCESSOR_TIMEOUT" : "PROCESSOR_ERROR";
    console.error("[delhivery-processor]", message);
    return NextResponse.json({ ok: false, error: { code, message } }, { status: 500 });
  }
}
