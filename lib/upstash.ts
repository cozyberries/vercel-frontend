import { Redis } from "@upstash/redis";

// Create Redis client instance
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Utility functions for common Redis operations
export class UpstashService {
  // Cache user session data
  static async cacheUserSession(
    userId: string,
    sessionData: any,
    ttl: number = 3600
  ) {
    try {
      await redis.setex(
        `user:session:${userId}`,
        ttl,
        JSON.stringify(sessionData)
      );
      return true;
    } catch (error) {
      console.error("Error caching user session:", error);
      return false;
    }
  }

  // Get cached user session
  static async getUserSession(userId: string) {
    try {
      const sessionData = await redis.get(`user:session:${userId}`);
      return sessionData ? JSON.parse(sessionData as string) : null;
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
      await redis.setex(
        `product:${productId}`,
        ttl,
        JSON.stringify(productData)
      );
      return true;
    } catch (error) {
      console.error("Error caching product:", error);
      return false;
    }
  }

  // Get cached product
  static async getCachedProduct(productId: string) {
    try {
      const productData = await redis.get(`product:${productId}`);
      return productData ? JSON.parse(productData as string) : null;
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
      await redis.setex(`cart:${userId}`, ttl, JSON.stringify(cartData));
      return true;
    } catch (error) {
      console.error("Error caching user cart:", error);
      return false;
    }
  }

  // Get cached user cart
  static async getCachedUserCart(userId: string) {
    try {
      const cartData = await redis.get(`cart:${userId}`);
      return cartData ? JSON.parse(cartData as string) : null;
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
      await redis.setex(
        `wishlist:${userId}`,
        ttl,
        JSON.stringify(wishlistData)
      );
      return true;
    } catch (error) {
      console.error("Error caching user wishlist:", error);
      return false;
    }
  }

  // Get cached user wishlist
  static async getCachedUserWishlist(userId: string) {
    try {
      const wishlistData = await redis.get(`wishlist:${userId}`);
      return wishlistData ? JSON.parse(wishlistData as string) : null;
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
      if (ttl) {
        await redis.setex(key, ttl, JSON.stringify(value));
      } else {
        await redis.set(key, JSON.stringify(value));
      }
      return true;
    } catch (error) {
      console.error("Error setting cache:", error);
      return false;
    }
  }

  // Generic cache getter
  static async get(key: string) {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data as string) : null;
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
}
