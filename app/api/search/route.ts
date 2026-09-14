import { searchResponse } from "@/lib/catalog/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return searchResponse(new URL(req.url).searchParams);
}
