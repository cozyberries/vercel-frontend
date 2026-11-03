import { NextResponse } from "next/server";
import { ProductError } from "./db";

export const NO_STORE = { "Cache-Control": "private, no-store" };

/** The browser shrinks photos to a 2000 px JPEG first; Vercel refuses request bodies over 4.5 MB anyway. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const SLUG_PARAM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSlugParam(slug: string): boolean {
  return slug.length <= 100 && SLUG_PARAM.test(slug);
}

export function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/** ProductError carries its own message and status; anything else is logged and hidden behind `fallback`. */
export function errorResponse(e: unknown, fallback: string) {
  if (e instanceof ProductError) return jsonError(e.message, e.status);
  console.error("[admin-products]", e);
  return jsonError(fallback, 500);
}
