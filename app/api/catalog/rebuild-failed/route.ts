import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { after } from "next/server";
import { notifyCatalogAlert } from "@/lib/services/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function decodeBase64(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    return Buffer.from(value, "base64").toString("utf8").slice(0, 400);
  } catch {
    return "";
  }
}

// QStash calls this after all retries of a rebuild message are exhausted.
async function onFailure(req: Request): Promise<Response> {
  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    // keep empty payload
  }
  after(() =>
    notifyCatalogAlert({
      title: "Rebuild failed after retries",
      details:
        `status ${String(payload.status ?? "unknown")}, retried ${String(payload.retried ?? "?")}/${String(payload.maxRetries ?? "?")}\n` +
        `scope: ${decodeBase64(payload.sourceBody)}\n` +
        `response: ${decodeBase64(payload.body)}`,
    }),
  );
  return Response.json({ received: true });
}

let verified: ((req: Request) => Promise<Response>) | null = null;

export async function POST(req: Request): Promise<Response> {
  if (!verified) verified = verifySignatureAppRouter(onFailure);
  return verified(req);
}
