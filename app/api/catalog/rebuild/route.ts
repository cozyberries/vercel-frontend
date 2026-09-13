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

// QStash-signed path. QSTASH_DEV=true switches verification to the local dev server keys.
const viaQstash = verifySignatureAppRouter(async (req: Request) => handleRebuild(req, deps(false)));

async function handler(req: Request): Promise<Response> {
  // Vercel cron and manual runs authenticate with the cron secret and alert directly.
  if (hasCronBearer(req)) return handleRebuild(req, deps(true));
  return viaQstash(req);
}

export const POST = handler;
export const GET = handler;
