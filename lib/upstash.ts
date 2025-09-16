import { Redis } from "@upstash/redis";
import { directRedis } from "./redis-client";

// Create Redis client instance
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Utility functions for common Redis operations
export class UpstashService {
  // Cache product data
  static async cacheProduct(
    productId: string,
    productData: any,
    ttl: number = 1800
  ) {
    try {
      // Validate product data before stringifying
      if (productData === null || productData === undefined) {
        return false;
      }

      const serializedData = JSON.stringify(productData);
      await redis.setex(`product:${productId}`, ttl, serializedData);
      return true;
    } catch (error) {
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
          return null;
        }
        return JSON.parse(productData);
      }
      return productData;
    } catch (error) {
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
      return {
        allowed: true,
        remaining: limit,
        resetTime: Date.now() + window * 1000,
      };
    }
  }

  // Generic cache setter
  static async set(key: string, value: any, ttl?: number) {
    try {
      // Validate value before stringifying
      if (value === null || value === undefined) {
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
          return null;
        }

        // Check if it's an object string representation
        if (data.startsWith("[object Object]")) {
          return null;
        }

        return JSON.parse(data);
      }

      return data;
    } catch (error) {
      return null;
    }
  }

  // Delete cache entry
  static async delete(key: string) {
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      return false;
    }
  }
}
