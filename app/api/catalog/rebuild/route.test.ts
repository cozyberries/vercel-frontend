import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression (2026-09-13): without QStash signing keys the lazily built verifier threw and the
// route answered 500 to unauthenticated callers. It must answer 401, and the cron bearer must
// still reach the handler.

const handleRebuild = vi.fn(async () => Response.json({ ok: true, handled: true }));
vi.mock("@/lib/catalog/rebuild-handler", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/catalog/rebuild-handler")>();
  return { ...original, handleRebuild: (...args: unknown[]) => handleRebuild(...(args as [])) };
});
vi.mock("@/lib/catalog/store", () => ({ catalogStore: () => ({}) }));
vi.mock("@/lib/catalog/supabase", () => ({ catalogDb: {} }));
vi.mock("@/lib/catalog/cache", () => ({ revalidateCatalog: vi.fn() }));
vi.mock("@/lib/services/telegram", () => ({ notifyCatalogAlert: vi.fn() }));
vi.mock("next/server", () => ({ after: (run: () => unknown) => run() }));
const verifySignatureAppRouter = vi.fn((handler: (req: Request) => Promise<Response>) => async (req: Request) => {
  if (req.headers.get("upstash-signature") !== "valid") return Response.json({ error: "bad signature" }, { status: 401 });
  return handler(req);
});
vi.mock("@upstash/qstash/nextjs", () => ({ verifySignatureAppRouter: (h: (req: Request) => Promise<Response>) => verifySignatureAppRouter(h) }));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  handleRebuild.mockClear();
  verifySignatureAppRouter.mockClear();
  delete process.env.QSTASH_CURRENT_SIGNING_KEY;
  delete process.env.QSTASH_NEXT_SIGNING_KEY;
  process.env.CRON_SECRET = "cron-s3cret";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function post(headers: Record<string, string> = {}): Promise<Response> {
  const { POST } = await import("./route");
  return POST(new Request("http://localhost/api/catalog/rebuild?full=1", { method: "POST", headers, body: "{}" }));
}

describe("POST /api/catalog/rebuild", () => {
  it("answers 401, not 500, when QStash signing keys are not configured", async () => {
    const response = await post();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "QStash signing keys are not configured" });
    expect(handleRebuild).not.toHaveBeenCalled();
    expect(verifySignatureAppRouter).not.toHaveBeenCalled();
  });

  it("lets the cron bearer through without QStash keys", async () => {
    const response = await post({ authorization: "Bearer cron-s3cret" });
    expect(response.status).toBe(200);
    expect(handleRebuild).toHaveBeenCalledTimes(1);
  });

  it("verifies the QStash signature when keys are configured", async () => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = "current";
    process.env.QSTASH_NEXT_SIGNING_KEY = "next";
    expect((await post()).status).toBe(401);
    expect(handleRebuild).not.toHaveBeenCalled();
    expect((await post({ "upstash-signature": "valid" })).status).toBe(200);
    expect(handleRebuild).toHaveBeenCalledTimes(1);
  });
});
