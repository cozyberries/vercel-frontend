import { Redis } from "@upstash/redis";
import { debugUpstashConfig } from "./debug-upstash";
import { directRedis } from "./redis-client";

// Create Redis client instance
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

console.log(process.env.UPSTASH_REDIS_REST_URL);
console.log(process.env.UPSTASH_REDIS_REST_TOKEN);
// Debug function to check Redis connection
async function testRedisConnection() {
  try {
    // First try the @upstash/redis library
    try {
      await redis.get("__connection_test__");
      console.log(
        "✅ Upstash Redis connection successful (using @upstash/redis)"
      );
      return true;
    } catch (upstashError) {
      console.warn(
        "@upstash/redis failed, trying direct connection...",
        upstashError
      );
    }

    // Fallback to direct Redis client
    await directRedis.ping();
    console.log("✅ Upstash Redis connection successful (using direct client)");
    return true;
  } catch (error) {
    console.error("❌ Both Redis connection methods failed:", error);

    // Additional debugging
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        name: error.name,
        stack: error.stack?.split("\n")[0],
      });

      // Check if it's the HTML response issue
      if (error.message.includes("<!DOCTYPE")) {
        console.error("🚨 Redis is returning HTML - this usually means:");
        console.error("1. Invalid credentials");
        console.error("2. Network/proxy issues");
        console.error("3. Upstash service is down");
      }
    }
    return false;
  }
}

// Utility functions for common Redis operations
export class UpstashService {
  private static logThrottle = new Map<string, number>();
  // Cache user session data
  static async cacheUserSession(
    userId: string,
    sessionData: any,
    ttl: number = 3600
  ) {
    try {
      // Validate session data before stringifying
      if (sessionData === null || sessionData === undefined) {
        console.warn(
          `Attempting to cache null/undefined session data for user: ${userId}`
        );
        return false;
      }

      const serializedData = JSON.stringify(sessionData);
      await redis.setex(`user:session:${userId}`, ttl, serializedData);
      return true;
    } catch (error) {
      console.error("Error caching user session:", error);
      console.error("Session data that failed to serialize:", sessionData);
      return false;
    }
  }

  // Get cached user session
  static async getUserSession(userId: string) {
    try {
      const sessionData = await redis.get(`user:session:${userId}`);
      if (!sessionData) return null;

      if (typeof sessionData === "object") return sessionData;
      if (typeof sessionData === "string") {
        if (
          sessionData.trim().startsWith("<!DOCTYPE") ||
          sessionData.trim().startsWith("<html")
        ) {
          console.warn(`Session cache returned HTML for user: ${userId}`);
          return null;
        }
        return JSON.parse(sessionData);
      }
      return sessionData;
    } catch (error) {
      console.error("Error getting user session:", error);
      return null;
    }
  }

  // Cache product data
  static async cacheProduct(
    productId: string,
    productData: any,
    ttl: number = 1800
  ) {
    try {
      // Validate product data before stringifying
      if (productData === null || productData === undefined) {
        console.warn(
          `Attempting to cache null/undefined product data for product: ${productId}`
        );
        return false;
      }

      const serializedData = JSON.stringify(productData);
      await redis.setex(`product:${productId}`, ttl, serializedData);
      return true;
    } catch (error) {
      console.error("Error caching product:", error);
      console.error("Product data that failed to serialize:", productData);
      return false;
    }
  }

  // Get cached product
  static async getCachedProduct(productId: string) {
    try {
      const productData = await redis.get(`product:${productId}`);
      if (!productData) return null;

      if (typeof productData === "object") return productData;
      if (typeof productData === "string") {
        if (
          productData.trim().startsWith("<!DOCTYPE") ||
          productData.trim().startsWith("<html")
        ) {
          console.warn(`Product cache returned HTML for product: ${productId}`);
          return null;
        }
        return JSON.parse(productData);
      }
      return productData;
    } catch (error) {
      console.error("Error getting cached product:", error);
      return null;
    }
  }

  // Cache user cart
  static async cacheUserCart(
    userId: string,
    cartData: any,
    ttl: number = 7200
  ) {
    try {
      // Validate cart data before stringifying
      if (cartData === null || cartData === undefined) {
        console.warn(
          `Attempting to cache null/undefined cart data for user: ${userId}`
        );
        return false;
      }

      // Test data serialization first
      let serializedData: string;
      try {
        serializedData = JSON.stringify(cartData);
      } catch (serializationError) {
        console.error("Failed to serialize cart data:", serializationError);
        console.error("Cart data:", cartData);
        return false;
      }

      // Test Redis connection before attempting to cache
      const connectionOk = await testRedisConnection();
      if (!connectionOk) {
        console.warn("Skipping cart caching due to Redis connection issues");
        return false;
      }

      // Try @upstash/redis first, then fallback to direct client
      try {
        await redis.setex(`cart:${userId}`, ttl, serializedData);
        console.log(
          `✅ Successfully cached cart for user: ${userId} (using @upstash/redis)`
        );
      } catch (upstashError) {
        console.warn("@upstash/redis setex failed, trying direct client...");
        await directRedis.setex(`cart:${userId}`, ttl, serializedData);
        console.log(
          `✅ Successfully cached cart for user: ${userId} (using direct client)`
        );
      }
      return true;
    } catch (error) {
      console.error("Error caching user cart:", error);
      console.error("Cart data that failed to cache:", cartData);

      // Check if error is related to HTML response (service issue)
      if (error instanceof Error && error.message.includes("<!DOCTYPE")) {
        console.error(
          "🚨 Upstash is returning HTML instead of accepting JSON - check service status and credentials"
        );
      }

      return false;
    }
  }

  // Get cached user cart
  static async getCachedUserCart(userId: string) {
    try {
      let cartData;
      let clientUsed = "@upstash/redis";

      // Try @upstash/redis first, then fallback to direct client
      try {
        cartData = await redis.get(`cart:${userId}`);
        console.log("🔍 REDIS GET: Using @upstash/redis library", { userId });
      } catch (upstashError) {
        console.warn("@upstash/redis get failed, trying direct client...");
        cartData = await directRedis.get(`cart:${userId}`);
        clientUsed = "direct-client";
        console.log("🔍 REDIS GET: Using direct Redis client", { userId });
      }

      if (!cartData) {
        this._throttleLog(`CACHE_EMPTY_${userId}`, () => {
          console.log("🚫 CACHE EMPTY: No cart data found in Redis", {
            userId,
            clientUsed,
          });
        });
        return null;
      }

      this._throttleLog(`CACHE_FOUND_${userId}`, () => {
        console.log("✅ CACHE FOUND: Cart data retrieved from Redis", {
          userId,
          clientUsed,
          dataType: typeof cartData,
          hasData: !!cartData,
        });
      });

      if (typeof cartData === "object") return cartData;
      if (typeof cartData === "string") {
        if (
          cartData.trim().startsWith("<!DOCTYPE") ||
          cartData.trim().startsWith("<html")
        ) {
          console.warn(`Cart cache returned HTML for user: ${userId}`);
          return null;
        }
        return JSON.parse(cartData);
      }
      return cartData;
    } catch (error) {
      console.error("Error getting cached cart:", error);
      return null;
    }
  }

  // Cache user wishlist
  static async cacheUserWishlist(
    userId: string,
    wishlistData: any,
    ttl: number = 7200
  ) {
    try {
      // Validate wishlist data before stringifying
      if (wishlistData === null || wishlistData === undefined) {
        console.warn(
          `Attempting to cache null/undefined wishlist data for user: ${userId}`
        );
        return false;
      }

      const serializedData = JSON.stringify(wishlistData);
      await redis.setex(`wishlist:${userId}`, ttl, serializedData);
      return true;
    } catch (error) {
      console.error("Error caching user wishlist:", error);
      console.error("Wishlist data that failed to serialize:", wishlistData);
      return false;
    }
  }

  // Get cached user wishlist
  static async getCachedUserWishlist(userId: string) {
    try {
      const wishlistData = await redis.get(`wishlist:${userId}`);
      if (!wishlistData) return null;

      if (typeof wishlistData === "object") return wishlistData;
      if (typeof wishlistData === "string") {
        if (
          wishlistData.trim().startsWith("<!DOCTYPE") ||
          wishlistData.trim().startsWith("<html")
        ) {
          console.warn(`Wishlist cache returned HTML for user: ${userId}`);
          return null;
        }
        return JSON.parse(wishlistData);
      }
      return wishlistData;
    } catch (error) {
      console.error("Error getting cached wishlist:", error);
      return null;
    }
  }

  // Rate limiting for API endpoints
  static async checkRateLimit(
    identifier: string,
    limit: number = 100,
    window: number = 3600
  ) {
    try {
      const key = `rate_limit:${identifier}`;
      const current = await redis.incr(key);

      if (current === 1) {
        await redis.expire(key, window);
      }

      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
        resetTime: Date.now() + window * 1000,
      };
    } catch (error) {
      console.error("Error checking rate limit:", error);
      return {
        allowed: true,
        remaining: limit,
        resetTime: Date.now() + window * 1000,
      };
    }
  }

  // Clear user data cache
  static async clearUserCache(userId: string) {
    try {
      const keys = await redis.keys(`*:${userId}`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return true;
    } catch (error) {
      console.error("Error clearing user cache:", error);
      return false;
    }
  }

  // Generic cache setter
  static async set(key: string, value: any, ttl?: number) {
    try {
      // Validate value before stringifying
      if (value === null || value === undefined) {
        console.warn(
          `Attempting to cache null/undefined value for key: ${key}`
        );
        return false;
      }

      const serializedValue = JSON.stringify(value);
      if (ttl) {
        await redis.setex(key, ttl, serializedValue);
      } else {
        await redis.set(key, serializedValue);
      }
      return true;
    } catch (error) {
      console.error("Error setting cache:", error);
      console.error("Value that failed to serialize:", value);
      return false;
    }
  }

  // Generic cache getter
  static async get(key: string) {
    try {
      const data = await redis.get(key);
      if (!data) return null;

      // Check if data is already an object (parsed)
      if (typeof data === "object") {
        return data;
      }

      // Check if data is a string that looks like JSON
      if (typeof data === "string") {
        // Check if it's HTML (error response) instead of JSON
        if (
          data.trim().startsWith("<!DOCTYPE") ||
          data.trim().startsWith("<html")
        ) {
          console.warn(`Cache returned HTML instead of JSON for key: ${key}`);
          return null;
        }

        // Check if it's an object string representation
        if (data.startsWith("[object Object]")) {
          console.warn(`Cache returned object string for key: ${key}`);
          return null;
        }

        return JSON.parse(data);
      }

      return data;
    } catch (error) {
      console.error("Error getting cache:", error);
      return null;
    }
  }

  // Delete cache entry
  static async delete(key: string) {
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      console.error("Error deleting cache:", error);
      return false;
    }
  }

  /**
   * Helper method to throttle logging to prevent spam
   */
  private static _throttleLog(key: string, logFn: () => void) {
    const now = Date.now();
    const lastTime = this.logThrottle.get(key) || 0;

    // Only log if it's been more than 1 second since last log
    if (now - lastTime > 1000) {
      logFn();
      this.logThrottle.set(key, now);
    }
  }
}
