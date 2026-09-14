import { getSnapshot } from "@/lib/catalog/cache";

// Static: cached by Next and the CDN, purged by revalidatePath("/api/catalog") in the rebuild job.
export const dynamic = "force-static";
export const revalidate = 604800;

export async function GET(): Promise<Response> {
  const { snapshot, source } = await getSnapshot();
  return Response.json(snapshot, {
    headers: {
      ETag: `"${snapshot.version}"`,
      "X-Catalog-Version": snapshot.version,
      "X-Cache-Status": source === "redis" ? "HIT" : "FALLBACK",
    },
  });
}
