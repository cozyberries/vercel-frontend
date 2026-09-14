import { timingSafeEqual } from "node:crypto";
import { Client } from "@upstash/qstash";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { processEvent, processScope, type EventPayload, type PublishMessage } from "@/lib/catalog/events";
import { catalogStore } from "@/lib/catalog/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let limiter: Ratelimit | null = null;
function rateLimiter(): Ratelimit {
  if (!limiter) {
    limiter = new Ratelimit({
      redis: new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! }),
      limiter: Ratelimit.slidingWindow(300, "1 m"),
      prefix: "cat:rl",
    });
  }
  return limiter;
}

function secretMatches(header: string | null): boolean {
  const expected = process.env.CATALOG_WEBHOOK_SECRET ?? "";
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

let qstash: Client | null = null;
async function publish(message: PublishMessage): Promise<{ messageId: string } | null> {
  if (!qstash) qstash = new Client({ token: process.env.QSTASH_TOKEN ?? "" });
  const result = await qstash.publishJSON(message);
  const first = Array.isArray(result) ? result[0] : result;
  return first ? { messageId: String((first as { messageId?: string }).messageId ?? "") } : null;
}

export async function POST(req: Request): Promise<Response> {
  if (!secretMatches(req.headers.get("x-catalog-secret"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { success } = await rateLimiter().limit("catalog-events");
  if (!success) return Response.json({ error: "Too many events" }, { status: 429 });

  const url = new URL(req.url);
  const deps = { store: catalogStore(), publish, baseUrl: process.env.CATALOG_BASE_URL ?? url.origin };
  const headers = { "Cache-Control": "no-store" };

  if (url.searchParams.get("full") === "1") {
    const outcome = await processScope({ kind: "full" }, deps);
    return Response.json({ outcomes: [outcome] }, { status: 202, headers });
  }

  let payload: EventPayload;
  try {
    payload = (await req.json()) as EventPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const outcomes = await processEvent(payload, deps);
  return Response.json({ outcomes }, { status: 202, headers });
}
