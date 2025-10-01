# Pipeline Error Fix - POST /pipeline 404

## Problem Summary

The error `POST http://localhost:3000/pipeline 404 (Not Found)` was occurring because **client-side code was trying to access Upstash Redis directly**.

## Root Cause

### The Issue

The `/pipeline` endpoint is part of Upstash's Redis REST API. When you make Redis operations (like `setex`, `get`, etc.), the Upstash SDK sends HTTP requests to this endpoint.

The problem:
1. **Client-side service** (`lib/services/wishlist.ts`) was calling `CacheService`
2. `CacheService` calls `UpstashService` which uses the Redis client
3. Redis client needs environment variables: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
4. **Environment variables without `NEXT_PUBLIC_` prefix are NOT available in the browser**
5. When Redis client couldn't find the URL, it defaulted to `localhost:3000`
6. Tried to POST to `/pipeline` on localhost → **404 Error**

### Stack Trace Explained

```
useWishlistPersistence.ts:54    ← Client-side React hook
   ↓
wishlist.ts:148                 ← Client-side service calling CacheService ❌
   ↓
cache.ts:82                     ← CacheService.setWishlist()
   ↓
upstash.ts:92                   ← Redis.setex() → POST to /pipeline
   ↓
localhost:3000/pipeline         ← 404 because endpoint doesn't exist
```

## The Fix

### What Was Changed

**File: `lib/services/wishlist.ts`**
- ❌ Removed all `CacheService` imports and calls
- ❌ Removed `CacheService.getWishlist()`
- ❌ Removed `CacheService.setWishlist()`
- ❌ Removed `CacheService.clearWishlist()`
- ✅ Client-side service now only talks to Supabase directly
- ✅ Added comments explaining that caching is handled by API routes

**File: `lib/services/orders.ts`**
- ❌ Removed unused `CacheService` import

### Architecture After Fix

```
Client-side (Browser)
  ↓
  useWishlistPersistence.ts → wishlistService.ts → Supabase
  ↓ (on GET requests, optionally)
  API Route: /api/wishlist
    ↓
    CacheService (server-side only) → Redis → Supabase
```

## Why This Is Better

### Security
- ✅ Redis credentials never exposed to the browser
- ✅ Environment variables stay server-side only

### Performance
- ✅ Caching still works (handled by API routes)
- ✅ Client-side code is simpler and faster

### Architecture
- ✅ Clear separation: Client talks to Supabase, API routes handle caching
- ✅ Follows Next.js best practices
- ✅ No more 404 errors!

## Best Practices

### ❌ NEVER Do This
```typescript
// Client-side service/hook
import CacheService from "@/lib/services/cache";

async saveData() {
  await CacheService.set(...); // ❌ Won't work in browser!
}
```

### ✅ Instead Do This
```typescript
// Client-side: Just use Supabase
async saveData() {
  await supabase.from('table').upsert(...);
}

// Server-side API route: Handle caching
export async function POST(request: NextRequest) {
  // Save to database
  await supabase.from('table').upsert(...);
  
  // Update cache (server-side only)
  await CacheService.set(...); // ✅ Works!
}
```

## Verification

To verify the fix works:

1. **Check browser console** - no more `/pipeline 404` errors
2. **Check Network tab** - Redis requests should not appear (they happen server-side)
3. **Test wishlist functionality** - add/remove items, should work normally
4. **Check API routes** - `/api/wishlist` handles caching correctly

## Files Modified

- ✅ `lib/services/wishlist.ts` - Removed client-side Redis calls
- ✅ `lib/services/orders.ts` - Removed unused import

## Files NOT Modified (Still Correct)

These files correctly use `CacheService` only on the server:
- ✅ `app/api/wishlist/route.ts` - Server-side caching
- ✅ `app/api/orders/route.ts` - Server-side caching
- ✅ `app/api/products/route.ts` - Server-side caching
- ✅ All other API routes - Server-side only

## Summary

The error was caused by trying to use Redis from the browser where environment variables aren't available. The fix ensures that:

1. **Client-side code** only talks to Supabase directly
2. **Server-side API routes** handle all Redis caching
3. **Environment variables** stay secure on the server
4. **No more 404 errors** for the `/pipeline` endpoint

The application architecture is now more secure, follows Next.js best practices, and the `/pipeline` error is completely resolved.

