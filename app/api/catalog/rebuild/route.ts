import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { revalidateCatalog } from "@/lib/catalog/cache";
import { handleRebuild, hasCronBearer } from "@/lib/catalog/rebuild-handler";
import { catalogStore } from "@/lib/catalog/store";
import { catalogDb } from "@/lib/catalog/supabase";
import { notifyCatalogAlert } from "@/lib/services/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function deps(alertOnFailure: boolean) {
  return { store: catalogStore(), db: catalogDb, revalidate: revalidateCatalog, alert: notifyCatalogAlert, alertOnFailure };
}

// QStash-signed path, built lazily: the SDK reads the signing keys when the verifier is created,
// and `next build` imports route modules in environments that may not have them.
// QSTASH_DEV=true switches verification to the local dev server keys.
let viaQstash: ((req: Request) => Promise<Response>) | null = null;
function qstashVerified(): (req: Request) => Promise<Response> {
  if (!viaQstash) viaQstash = verifySignatureAppRouter(async (req: Request) => handleRebuild(req, deps(false)));
  return viaQstash;
}

async function handler(req: Request): Promise<Response> {
  // Vercel cron and manual runs authenticate with the cron secret and alert directly.
  if (hasCronBearer(req)) return handleRebuild(req, deps(true));
  return qstashVerified()(req);
}

export const POST = handler;
export const GET = handler;
