#!/usr/bin/env node

/**
 * Cache Warming Script
 * 
 * This script can be used to warm up caches after deployment
 * Add this to your deployment pipeline or run manually
 * 
 * Usage:
 *   node scripts/warm-cache.js
 *   node scripts/warm-cache.js --url=https://yourdomain.com
 */

const https = require('https');
const http = require('http');

// Configuration
const DEFAULT_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
const BASE_URL = process.argv.find(arg => arg.startsWith('--url='))?.split('=')[1] || DEFAULT_URL;

console.log(`🔥 Starting cache warming for: ${BASE_URL}`);

async function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const startTime = Date.now();
    
    protocol.get(url, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        const duration = Date.now() - startTime;
        const cacheStatus = res.headers['x-cache-status'] || 'UNKNOWN';
        const dataSource = res.headers['x-data-source'] || 'UNKNOWN';
        
        resolve({
          status: res.statusCode,
          duration,
          cacheStatus,
          dataSource,
          url
        });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function warmCache() {
  const requests = [
    // Featured products
    `${BASE_URL}/api/products?featured=true&limit=4`,
    
    // Main products page (first page)
    `${BASE_URL}/api/products?limit=12&page=1`,
    
    // Categories
    `${BASE_URL}/api/categories`,
    
    // Common product searches
    `${BASE_URL}/api/products?limit=12&page=1&sortBy=price&sortOrder=asc`,
    `${BASE_URL}/api/products?limit=12&page=1&sortBy=name&sortOrder=asc`,
  ];

  // First, trigger the cache warming endpoint
  console.log('🔥 Triggering cache warming endpoint...');
  try {
    const warmResult = await makePostRequest(`${BASE_URL}/api/cache/warm`);
    const statusEmoji = warmResult.status === 200 ? '✅' : '❌';
    console.log(`${statusEmoji} Cache warm endpoint: ${warmResult.status} | ${warmResult.duration}ms`);
    
    if (warmResult.data && warmResult.data.results) {
      const { results } = warmResult.data;
      if (results.featured) console.log(`   🎯 Featured products cached: ${results.featured.count} items`);
      if (results.products) console.log(`   📦 Products cached: ${results.products.count}/${results.products.totalItems} items`);
      if (results.categories) console.log(`   📂 Categories cached: ${results.categories.count} items`);
      if (results.errors.length > 0) {
        console.log(`   ⚠️  Errors: ${results.errors.length}`);
        results.errors.forEach(error => console.log(`      - ${error}`));
      }
    }
  } catch (error) {
    console.error(`❌ Cache warming endpoint failed: ${error.message}`);
  }
  
  console.log('\n🚀 Testing cached endpoints...');

  console.log(`🚀 Warming ${requests.length} endpoints...\n`);

  const results = [];
  
  for (const url of requests) {
    try {
      console.log(`📡 Requesting: ${url}`);
      
      const result = await makeRequest(url);
      results.push(result);
      
      const statusEmoji = result.status === 200 ? '✅' : '❌';
      const cacheEmoji = result.cacheStatus === 'HIT' ? '🎯' : result.cacheStatus === 'STALE' ? '⚠️' : '🆕';
      
      console.log(`${statusEmoji} ${result.status} | ${result.duration}ms | ${cacheEmoji} ${result.cacheStatus} | ${result.dataSource}`);
      
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`❌ Failed to warm: ${url}`);
      console.error(`   Error: ${error.message}`);
      results.push({
        url,
        status: 'ERROR',
        error: error.message
      });
    }
  }

  console.log('\n📊 Cache Warming Summary:');
  console.log('=' .repeat(50));
  
  const successful = results.filter(r => r.status === 200);
  const failed = results.filter(r => r.status !== 200);
  
  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  
  if (successful.length > 0) {
    const avgDuration = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
    console.log(`⏱️  Average response time: ${avgDuration.toFixed(0)}ms`);
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed requests:');
    failed.forEach(r => {
      console.log(`   ${r.url} - ${r.error || r.status}`);
    });
  }
  
  console.log('\n🎉 Cache warming completed!');
  
  // Exit with error code if any requests failed
  process.exit(failed.length > 0 ? 1 : 0);
}

// Handle POST request for cache warming endpoint
async function makePostRequest(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    const startTime = Date.now();
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': 0
      }
    };
    
    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        const duration = Date.now() - startTime;
        resolve({
          status: res.statusCode,
          duration,
          url,
          data: data ? JSON.parse(data) : null
        });
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.end();
  });
}

// Update the warmCache function to handle POST request
warmCache().catch(error => {
  console.error('❌ Cache warming failed:', error);
  process.exit(1);
});
