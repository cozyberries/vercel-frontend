import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import CacheService from "@/lib/services/cache";

/**
 * Debug endpoint for user-specific cache operations
 * GET /api/debug/user-cache - Get cache statistics for the current user
 * DELETE /api/debug/user-cache - Clear all cache for the current user
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "stats";

    switch (action) {
      case "stats":
        const stats = await CacheService.getUserCacheStats(user.id);
        return NextResponse.json({
          user_id: user.id,
          cache_stats: stats,
          timestamp: new Date().toISOString(),
        });

      case "keys":
        // Return the cache keys for this user (for debugging)
        const keys = {
          wishlist: CacheService.getCacheKey("WISHLIST", user.id),
          orders_default: CacheService.getCacheKey("ORDERS", user.id, "list:default"),
          profile: CacheService.getCacheKey("PROFILE", user.id),
          addresses: CacheService.getCacheKey("ADDRESSES", user.id),
        };
        return NextResponse.json({
          user_id: user.id,
          cache_keys: keys,
          timestamp: new Date().toISOString(),
        });

      default:
        return NextResponse.json(
          { error: "Invalid action. Use 'stats' or 'keys'" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Error in user cache debug endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const confirm = searchParams.get("confirm");

    if (confirm !== "true") {
      return NextResponse.json(
        { 
          error: "Confirmation required", 
          message: "Add ?confirm=true to clear all cache for this user" 
        },
        { status: 400 }
      );
    }

    // Clear all cache for the user
    const success = await CacheService.clearAllUserCache(user.id);

    return NextResponse.json({
      user_id: user.id,
      cache_cleared: success,
      message: success ? "All user cache cleared successfully" : "Failed to clear some cache entries",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error clearing user cache:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
