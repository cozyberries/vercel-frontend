import { NextResponse } from "next/server";
import { isRedisConfigured, checkRedisReachable } from "@/lib/upstash";

/**
 * GET /api/health/redis
 * Validates that Redis is configured and reachable. Use for startup checks and monitoring.
 * Returns 200 when Redis is configured and ping succeeds; 503 otherwise.
 */
export async function GET() {
  if (!isRedisConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        reachable: false,
        error: "Redis is required but not configured",
        message: "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your environment.",
      },
      { status: 503 }
    );
  }

  const result = await checkRedisReachable();
  if (!result.ok) {
    return NextResponse.json(
      {
        configured: true,
        reachable: false,
        error: result.error,
        message: "Redis is configured but not reachable. Check URL, token, and network.",
      },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { configured: true, reachable: true, status: "ok" },
    { status: 200 }
  );
}
