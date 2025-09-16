/**
 * Debug utility to check Upstash configuration
 * Run this to verify your Upstash Redis setup
 */

export function debugUpstashConfig() {
  console.log("🔍 Upstash Configuration Debug:");
  console.log("================================");
  
  const hasUrl = !!process.env.UPSTASH_REDIS_REST_URL;
  const hasToken = !!process.env.UPSTASH_REDIS_REST_TOKEN;
  
  console.log(`✅ UPSTASH_REDIS_REST_URL: ${hasUrl ? "Set" : "❌ Missing"}`);
  console.log(`✅ UPSTASH_REDIS_REST_TOKEN: ${hasToken ? "Set" : "❌ Missing"}`);
  
  if (hasUrl) {
    const url = process.env.UPSTASH_REDIS_REST_URL!;
    const isValidUrl = url.startsWith('https://') && url.includes('upstash.io');
    console.log(`URL Format: ${isValidUrl ? "✅ Valid" : "❌ Invalid format"}`);
    console.log(`URL Preview: ${url.substring(0, 30)}...`);
  }
  
  if (hasToken) {
    const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
    console.log(`Token Length: ${token.length} characters`);
    console.log(`Token Preview: ${token.substring(0, 10)}...`);
  }
  
  if (!hasUrl || !hasToken) {
    console.log("\n❌ Missing Upstash credentials!");
    console.log("Please add these to your .env.local file:");
    console.log("UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io");
    console.log("UPSTASH_REDIS_REST_TOKEN=your-token-here");
  }
  
  console.log("================================");
}

// Auto-run in development
if (process.env.NODE_ENV === 'development') {
  debugUpstashConfig();
}
