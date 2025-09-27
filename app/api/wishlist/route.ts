import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import CacheService from "@/lib/services/cache";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Try to get from cache first
    const { data: cachedWishlist, ttl, isStale } = await CacheService.getWishlist(user.id);
    
    if (cachedWishlist) {
      const headers = {
        "X-Cache-Status": isStale ? "STALE" : "HIT",
        "X-Cache-Key": CacheService.getCacheKey("WISHLIST", user.id),
        "X-Data-Source": "REDIS_CACHE",
        "X-Cache-TTL": ttl.toString(),
      };

      // If data is stale, trigger background revalidation
      if (isStale) {
        (async () => {
          try {
            console.log(`Background revalidation for wishlist: ${user.id}`);
            await refreshWishlistInBackground(user.id, supabase);
          } catch (error) {
            console.error(`Background wishlist refresh failed for user ${user.id}:`, error);
          }
        })();
      }

      return NextResponse.json({
        wishlist: cachedWishlist,
        user_id: user.id,
      }, { headers });
    }

    // No cache hit, fetch from database
    const { data, error } = await supabase
      .from("user_wishlists")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching wishlist:", error);
      return NextResponse.json(
        { error: "Failed to fetch wishlist" },
        { status: 500 }
      );
    }

    const wishlistItems = data?.items || [];
    
    // Cache the result
    await CacheService.setWishlist(user.id, wishlistItems);

    const headers = {
      "X-Cache-Status": "MISS",
      "X-Cache-Key": CacheService.getCacheKey("WISHLIST", user.id),
      "X-Data-Source": "SUPABASE_DATABASE",
      "X-Cache-Set": "SUCCESS",
    };

    return NextResponse.json({
      wishlist: wishlistItems,
      user_id: user.id,
    }, { headers });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Background refresh function for stale-while-revalidate pattern
 */
async function refreshWishlistInBackground(userId: string, supabase: any): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("user_wishlists")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error in background wishlist refresh:", error);
      return;
    }

    const wishlistItems = data?.items || [];
    await CacheService.setWishlist(userId, wishlistItems);
  } catch (error) {
    console.error("Error in background wishlist refresh:", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { items } = body;

    if (!Array.isArray(items)) {
      return NextResponse.json(
        { error: "Items must be an array" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("user_wishlists")
      .upsert(
        {
          user_id: user.id,
          items: items,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error saving wishlist:", error);
      return NextResponse.json(
        { error: "Failed to save wishlist" },
        { status: 500 }
      );
    }

    // Update cache with the new data
    await CacheService.setWishlist(user.id, items);

    return NextResponse.json({
      success: true,
      wishlist: data,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const supabase = await createServerSupabaseClient();
    
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { error } = await supabase
      .from("user_wishlists")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      console.error("Error clearing wishlist:", error);
      return NextResponse.json(
        { error: "Failed to clear wishlist" },
        { status: 500 }
      );
    }

    // Clear cache
    await CacheService.clearWishlist(user.id);

    return NextResponse.json({
      success: true,
      message: "Wishlist cleared successfully",
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
