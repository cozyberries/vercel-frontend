# Cache Validation Guide

This guide explains how to validate whether your API is retrieving data from cache (Redis) or database (Supabase).

## 🔍 Validation Methods

### Method 1: Response Headers
Every API response now includes headers that indicate the data source:

```bash
# Cache Hit (data from Redis)
X-Cache-Status: HIT
X-Cache-Key: products:list:100
X-Data-Source: REDIS_CACHE

# Cache Miss (data from Database)
X-Cache-Status: MISS
X-Cache-Key: products:list:100
X-Data-Source: SUPABASE_DATABASE
X-Cache-Set: SUCCESS
```

**How to check:**
```bash
# Using curl
curl -I http://localhost:3000/api/products

# Using browser DevTools
# 1. Open Network tab
# 2. Make API request
# 3. Check Response Headers
```

### Method 2: Response Headers Analysis
Monitor cache behavior through response headers and timing:

```bash
# Cache Hit - Fast response time (< 50ms)
X-Cache-Status: HIT
X-Data-Source: REDIS_CACHE

# Cache Miss - Slower response time (> 100ms)
X-Cache-Status: MISS
X-Data-Source: SUPABASE_DATABASE
```

### Method 3: Debug Cache Endpoint
Use the debug endpoint to inspect cache state:

```bash
# Test Redis connection
GET /api/debug/cache?action=ping

# List all cache keys
GET /api/debug/cache?action=keys

# List product cache keys only
GET /api/debug/cache?action=keys&pattern=products:*

# Get specific cache value
GET /api/debug/cache?action=get&key=products:list:100

# Get cache statistics
GET /api/debug/cache?action=stats

# Clear specific cache key
GET /api/debug/cache?action=clear&key=products:list:100

# Clear all product cache keys
GET /api/debug/cache?action=clear&key=products:*

# Clear ALL cache (dangerous!)
DELETE /api/debug/cache?confirm=true
```

### Method 4: Cache Metrics API
Monitor cache performance and hit rates:

```bash
# Get overall cache statistics
GET /api/debug/metrics?action=stats

# Get metrics for products
GET /api/debug/metrics?action=key&key=products

# Get metrics for categories
GET /api/debug/metrics?action=key&key=categories

# Clear metrics
GET /api/debug/metrics?action=clear
```

## 🧪 Testing Cache Behavior

### Test 1: Fresh Request (Should be Cache Miss)
1. Clear the cache: `GET /api/debug/cache?action=clear&key=products:*`
2. Make API request: `GET /api/products`
3. Check headers: Should show `X-Cache-Status: MISS`
4. Check logs: Should show `💾 CACHE MISS`

### Test 2: Subsequent Request (Should be Cache Hit)
1. Make the same API request again: `GET /api/products`
2. Check headers: Should show `X-Cache-Status: HIT`
3. Check logs: Should show `✅ CACHE HIT`

### Test 3: Different Parameters (Should be Cache Miss)
1. Request with different limit: `GET /api/products?limit=50`
2. Check headers: Should show `X-Cache-Status: MISS` (different cache key)

### Test 4: Cache Expiration
1. Wait for cache TTL to expire (30 minutes for products, 1 hour for categories)
2. Make API request
3. Should be cache miss again

## 📊 Performance Monitoring

### Response Time Comparison
- **Cache Hit**: Typically 10-50ms
- **Database Query**: Typically 100-500ms

### Monitor via Metrics API
```bash
curl http://localhost:3000/api/debug/metrics?action=stats
```

Response includes:
- `hit_rate_24h`: Cache hit rate in last 24 hours
- `avg_response_time_ms`: Average response time
- `recent_operations`: Last 10 cache operations

## 🛠️ Development Tips

### Force Cache Miss for Testing
```bash
# Clear specific cache before testing
curl "http://localhost:3000/api/debug/cache?action=clear&key=products:list:100"

# Then make your API request
curl "http://localhost:3000/api/products?limit=100"
```

### Monitor Real-time
1. Open browser DevTools Network tab
2. Make API requests
3. Check response headers:
   - `X-Cache-Status: HIT` - Data served from Redis
   - `X-Cache-Status: MISS` - Data fetched from Supabase
4. Compare response times (cache hits should be faster)

### Browser Testing
```javascript
// In browser console
fetch('/api/products')
  .then(response => {
    console.log('Cache Status:', response.headers.get('X-Cache-Status'));
    console.log('Data Source:', response.headers.get('X-Data-Source'));
    return response.json();
  })
  .then(data => console.log('Data:', data));
```

## 🔧 Cache Keys Structure
- Products: `products:list:{limit}`
- Categories: `categories:list`
- Individual Products: `product:{id}`

## ⚠️ Important Notes

1. **First Request**: Always a cache miss (no data in cache yet)
2. **Cache TTL**: 
   - Products: 30 minutes (1800 seconds)
   - Categories: 1 hour (3600 seconds)
3. **Cache Invalidation**: Happens when:
   - New product is created (clears `products:list:100`)
   - Manual cache clearing via debug endpoint
4. **Development Mode**: Cache persists between server restarts when using external Redis

## 🚨 Debug Endpoints Security
The debug endpoints (`/api/debug/*`) should be protected in production. Consider:
- Environment-based access control
- Authentication requirements
- Rate limiting

## 📈 Expected Behavior

### Healthy Cache Performance
- Hit rate > 70% after warm-up period
- Response time < 50ms for cache hits
- Response time < 500ms for cache misses

### Signs of Cache Issues
- Hit rate < 30%
- Frequent cache set failures
- High response times for cache hits
- Redis connection errors in debug/ping

## Example Validation Workflow

1. **Clear cache**: `GET /api/debug/cache?action=clear&key=products:*`
2. **First request**: `GET /api/products` → Should be MISS
3. **Second request**: `GET /api/products` → Should be HIT
4. **Check stats**: `GET /api/debug/metrics?action=stats`
5. **Verify headers**: Look for X-Cache-Status in response headers
