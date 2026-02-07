# User Data Caching Implementation Guide

This guide explains the comprehensive caching system implemented for user-specific data including wishlist, orders, and user profile information.

## 🎯 Overview

The caching system implements a **stale-while-revalidate** pattern using Redis (Upstash) for optimal performance:

- **Immediate Response**: Returns cached data instantly when available
- **Background Refresh**: Updates stale data in the background without blocking requests
- **Smart TTL**: Different TTL values optimized for each data type
- **Cache Invalidation**: Automatic cache updates when data changes

## 🏗️ Architecture

### Cache Service (`/lib/services/cache.ts`)

Centralized cache management with the following features:

- **Type-safe operations** for different data types
- **TTL-based expiration** with background refresh
- **Automatic key generation** with consistent patterns
- **Utility methods** for debugging and monitoring

### Cache TTL Configuration

```typescript
WISHLIST: 1800,      // 30 minutes
ORDERS: 900,         // 15 minutes  
PROFILE: 3600,       // 1 hour
ADDRESSES: 1800,     // 30 minutes
ORDER_DETAILS: 600,  // 10 minutes
```

### Cache Key Patterns

```
user:wishlist:{userId}
user:orders:{userId}:list:{filters}
user:order:{userId}:{orderId}
user:profile:{userId}
user:addresses:{userId}
```

## 🔧 Implementation Details

### 1. Wishlist Caching

**API Routes**: `/api/wishlist`
- ✅ GET: Cache with background refresh
- ✅ POST: Cache invalidation on updates
- ✅ DELETE: Cache clearing

**Service**: `/lib/services/wishlist.ts`
- ✅ Stale-while-revalidate pattern
- ✅ Local storage + Redis caching
- ✅ Automatic cache updates

### 2. Orders Caching

**API Routes**: `/api/orders`, `/api/orders/[id]`
- ✅ GET orders list: Filtered cache keys
- ✅ GET order details: Individual order caching
- ✅ Background refresh for stale data

**Features**:
- **Filter-based caching**: Different cache keys for different filters
- **Individual order caching**: Separate cache for order details
- **Payment data inclusion**: Orders cached with payment information

### 3. Profile Caching

**API Routes**: `/api/profile`, `/api/profile/addresses`
- ✅ GET profile: User data with background refresh
- ✅ PUT profile: Cache update on changes
- ✅ GET addresses: Address list caching
- ✅ POST addresses: Cache invalidation

## 📊 Cache Headers

All cached responses include diagnostic headers:

```http
X-Cache-Status: HIT | MISS | STALE
X-Cache-Key: user:wishlist:123e4567-e89b-12d3-a456-426614174000
X-Data-Source: REDIS_CACHE | SUPABASE_DATABASE
X-Cache-TTL: 1234
X-Cache-Set: SUCCESS
```

## 🛠️ Debugging & Monitoring

### Debug Endpoint

**GET** `/api/debug/user-cache?action=stats`
```json
{
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "cache_stats": {
    "wishlist": { "exists": true, "ttl": 1234 },
    "orders": { "exists": true, "ttl": 567 },
    "profile": { "exists": true, "ttl": 2345 },
    "addresses": { "exists": false, "ttl": -1 }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**GET** `/api/debug/user-cache?action=keys`
```json
{
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "cache_keys": {
    "wishlist": "user:wishlist:123e4567-e89b-12d3-a456-426614174000",
    "orders_default": "user:orders:123e4567-e89b-12d3-a456-426614174000:list:default",
    "profile": "user:profile:123e4567-e89b-12d3-a456-426614174000",
    "addresses": "user:addresses:123e4567-e89b-12d3-a456-426614174000"
  }
}
```

**DELETE** `/api/debug/user-cache?confirm=true`
- Clears all cache entries for the current user

### Browser DevTools

Check response headers in Network tab:
1. Open DevTools → Network tab
2. Make API requests to cached endpoints
3. Check response headers for cache status

## 🚀 Performance Benefits

### Before Caching
- **First-time load**: 400-800ms
- **Repeat visits**: 400-800ms (always database)
- **Database load**: High for frequent requests

### After Caching
- **First-time load**: 400-800ms (cache miss)
- **Cache hit**: 50-150ms (80-90% faster)
- **Stale cache**: 100-250ms (with background refresh)
- **Database load**: Significantly reduced

## 🔄 Cache Lifecycle

### 1. Cache Miss Flow
```
Request → Cache Check → Database Query → Cache Store → Response
```

### 2. Cache Hit Flow
```
Request → Cache Check → Immediate Response
```

### 3. Stale-While-Revalidate Flow
```
Request → Cache Check (Stale) → Immediate Response + Background Refresh
```

## 🛡️ Error Handling

### Cache Failures
- **Graceful degradation**: Falls back to database on cache errors
- **Error logging**: All cache errors are logged for monitoring
- **No user impact**: Cache failures don't affect user experience

### Database Failures
- **Cached data**: Returns last known good data if available
- **Error responses**: Proper HTTP status codes and error messages

## 🔧 Configuration

### Environment Variables
```env
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
```

### TTL Customization
Modify TTL values in `/lib/services/cache.ts`:

```typescript
private static readonly TTL_CONFIG = {
  WISHLIST: 1800,     // Adjust as needed
  ORDERS: 900,        // Shorter for frequently changing data
  PROFILE: 3600,      // Longer for stable data
  // ...
};
```

## 📝 Usage Examples

### Frontend Usage
The caching is transparent to frontend components. Existing hooks and API calls work without changes:

```typescript
// This automatically uses caching
const { wishlist } = useWishlist();
const orders = await orderService.getUserOrders();
const profile = await fetch('/api/profile');
```

### Cache Debugging
```typescript
// Check cache stats
const response = await fetch('/api/debug/user-cache?action=stats');
const stats = await response.json();

// Clear user cache
await fetch('/api/debug/user-cache?confirm=true', { method: 'DELETE' });
```

## 🔄 Cache Invalidation Strategies

### Automatic Invalidation
- **Profile updates**: Cache cleared on PUT `/api/profile`
- **Address changes**: Cache cleared on POST `/api/profile/addresses`
- **Wishlist changes**: Cache updated on POST/DELETE `/api/wishlist`

### Manual Invalidation
- **Debug endpoint**: Clear all user cache
- **Admin tools**: Clear specific cache patterns

## 🎯 Best Practices

### 1. Cache Key Design
- **Consistent patterns**: Follow established key formats
- **User isolation**: Always include user ID in keys
- **Filter inclusion**: Include filter parameters in keys

### 2. TTL Selection
- **Frequently changing data**: Shorter TTL (5-15 minutes)
- **Stable data**: Longer TTL (30-60 minutes)
- **Critical data**: Balance between freshness and performance

### 3. Error Handling
- **Always fallback**: Never let cache errors break functionality
- **Log everything**: Monitor cache performance and errors
- **Graceful degradation**: Provide good UX even without cache

## 📈 Monitoring

### Key Metrics
- **Cache hit rate**: Target >80% for frequently accessed data
- **Response times**: Monitor cache vs database response times
- **Error rates**: Track cache operation failures
- **Memory usage**: Monitor Redis memory consumption

### Alerting
Set up alerts for:
- **Low hit rates** (< 70%)
- **High error rates** (> 5%)
- **Slow response times** (> 200ms for cached data)

## 🔮 Future Enhancements

### Planned Features
- **Cache warming**: Pre-populate cache for new users
- **Advanced analytics**: Detailed cache performance metrics
- **Smart prefetching**: Predict and cache likely-needed data
- **Cache compression**: Reduce memory usage for large datasets

### Optimization Opportunities
- **Selective field caching**: Cache only frequently accessed fields
- **Hierarchical caching**: Multi-level cache strategy
- **Edge caching**: CDN-level caching for static user data
