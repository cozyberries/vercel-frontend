import { NextRequest, NextResponse } from "next/server";
import { CacheMonitor } from "@/lib/utils/cache-monitor";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const keyPattern = searchParams.get("key");

    switch (action) {
      case "stats":
        // Get overall cache statistics
        const stats = CacheMonitor.getStats();
        return NextResponse.json({
          cache_statistics: stats,
          timestamp: new Date().toISOString()
        });

      case "key":
        // Get metrics for specific key pattern
        if (!keyPattern) {
          return NextResponse.json({ 
            error: "Key parameter is required for key action" 
          }, { status: 400 });
        }
        
        const keyMetrics = CacheMonitor.getKeyMetrics(keyPattern);
        return NextResponse.json({
          key_metrics: keyMetrics,
          timestamp: new Date().toISOString()
        });

      case "clear":
        // Clear stored metrics
        CacheMonitor.clearMetrics();
        return NextResponse.json({
          message: "Cache metrics cleared",
          timestamp: new Date().toISOString()
        });

      default:
        return NextResponse.json({
          message: "Cache Metrics API",
          available_actions: [
            "stats - Get overall cache statistics",
            "key - Get metrics for specific key pattern (requires ?key=pattern)",
            "clear - Clear stored metrics"
          ],
          examples: [
            "/api/debug/metrics?action=stats",
            "/api/debug/metrics?action=key&key=products",
            "/api/debug/metrics?action=key&key=categories",
            "/api/debug/metrics?action=clear"
          ],
          timestamp: new Date().toISOString()
        });
    }
  } catch (error) {
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
