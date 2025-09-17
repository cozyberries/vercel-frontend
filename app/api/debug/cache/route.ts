import { NextRequest, NextResponse } from "next/server";
import { UpstashService } from "@/lib/upstash";
import { directRedis } from "@/lib/redis-client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const key = searchParams.get("key");

    switch (action) {
      case "ping":
        // Test Redis connection
        try {
          const pong = await directRedis.ping();
          return NextResponse.json({ 
            status: "connected", 
            response: pong,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          return NextResponse.json({ 
            status: "error", 
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          }, { status: 500 });
        }

      case "keys":
        // List all cache keys (or filter by pattern)
        try {
          const pattern = searchParams.get("pattern") || "*";
          const keys = await directRedis.keys(pattern);
          return NextResponse.json({ 
            keys, 
            count: keys?.length || 0,
            pattern,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
          }, { status: 500 });
        }

      case "get":
        // Get specific cache value
        if (!key) {
          return NextResponse.json({ 
            error: "Key parameter is required for get action" 
          }, { status: 400 });
        }
        
        try {
          const value = await UpstashService.get(key);
          return NextResponse.json({ 
            key, 
            value, 
            exists: value !== null,
            type: typeof value,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
          }, { status: 500 });
        }

      case "clear":
        // Clear specific cache key or pattern
        if (!key) {
          return NextResponse.json({ 
            error: "Key parameter is required for clear action" 
          }, { status: 400 });
        }
        
        try {
          // If key contains wildcard, get matching keys first
          if (key.includes("*")) {
            const keys = await directRedis.keys(key);
            if (keys && keys.length > 0) {
              await directRedis.del(...keys);
              return NextResponse.json({ 
                action: "cleared", 
                pattern: key,
                deletedKeys: keys,
                count: keys.length,
                timestamp: new Date().toISOString()
              });
            } else {
              return NextResponse.json({ 
                action: "no_keys_found", 
                pattern: key,
                timestamp: new Date().toISOString()
              });
            }
          } else {
            await directRedis.del(key);
            return NextResponse.json({ 
              action: "cleared", 
              key,
              timestamp: new Date().toISOString()
            });
          }
        } catch (error) {
          return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
          }, { status: 500 });
        }

      case "stats":
        // Get cache statistics
        try {
          const productKeys = await directRedis.keys("products:*");
          const categoryKeys = await directRedis.keys("categories:*");
          const allKeys = await directRedis.keys("*");
          
          return NextResponse.json({
            statistics: {
              total_keys: allKeys?.length || 0,
              product_cache_keys: productKeys?.length || 0,
              category_cache_keys: categoryKeys?.length || 0,
              all_keys: allKeys || [],
              product_keys: productKeys || [],
              category_keys: categoryKeys || []
            },
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
          }, { status: 500 });
        }

      default:
        return NextResponse.json({
          message: "Redis Cache Debug Endpoint",
          available_actions: [
            "ping - Test Redis connection",
            "keys - List all cache keys (use ?pattern=products:* for filtered results)",
            "get - Get cache value (requires ?key=your_key)",
            "clear - Clear cache key or pattern (requires ?key=your_key_or_pattern)",
            "stats - Get cache statistics"
          ],
          examples: [
            "/api/debug/cache?action=ping",
            "/api/debug/cache?action=keys",
            "/api/debug/cache?action=keys&pattern=products:*",
            "/api/debug/cache?action=get&key=products:list:100",
            "/api/debug/cache?action=clear&key=products:list:100",
            "/api/debug/cache?action=clear&key=products:*",
            "/api/debug/cache?action=stats"
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

// DELETE method to clear all cache
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const confirm = searchParams.get("confirm");
    
    if (confirm !== "true") {
      return NextResponse.json({
        error: "This will clear ALL cache. Add ?confirm=true to proceed",
        warning: "This action cannot be undone"
      }, { status: 400 });
    }
    
    const allKeys = await directRedis.keys("*");
    if (allKeys && allKeys.length > 0) {
      await directRedis.del(...allKeys);
      return NextResponse.json({
        action: "all_cache_cleared",
        deleted_keys: allKeys,
        count: allKeys.length,
        timestamp: new Date().toISOString()
      });
    } else {
      return NextResponse.json({
        message: "No cache keys found to clear",
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    return NextResponse.json(
      { 
        error: "Failed to clear cache", 
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
