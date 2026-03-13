import { chromium, type Request } from 'playwright';

(async () => {
  console.log('=== Products Page Performance Analysis ===\n');
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Track ALL network requests — keyed by Request object identity for correct pairing
  const apiRequests: { request: Request; url: string; startTime: number; endTime?: number; status?: number; size?: number; type: string }[] = [];
  // Initialized to Date.now() before handlers are registered so startTime is never computed
  // against a zero baseline if a request fires before page.goto() is called.
  let pageLoadStart = Date.now();

  page.on('request', request => {
    const url = request.url();
    const type = request.resourceType();
    if (url.includes('localhost:3000')) {
      apiRequests.push({
        request,
        url,
        startTime: Date.now() - pageLoadStart,
        type,
      });
    }
  });

  // Match by request object identity (not URL string) to handle concurrent duplicate URLs.
  // Fall back to response.body() byte count when content-length header is absent (chunked /
  // compressed responses).
  page.on('response', async response => {
    const req = response.request();
    const entry = apiRequests.find(r => r.request === req);
    if (entry) {
      entry.endTime = Date.now() - pageLoadStart;
      entry.status = response.status();
      const contentLength = response.headers()['content-length'];
      if (contentLength) {
        entry.size = Number(contentLength);
      } else {
        try {
          const body = await response.body();
          entry.size = body.byteLength;
        } catch {
          entry.size = 0;
        }
      }
    }
  });

  console.log('--- Navigating to /products ---');
  // Reset start time just before navigation so all timings are relative to this moment.
  pageLoadStart = Date.now();
  await page.goto('http://localhost:3000/products', { waitUntil: 'networkidle' });
  const loadTime = Date.now() - pageLoadStart;

  console.log(`\nPage load time: ${loadTime}ms\n`);

  // Group requests by type
  const apiOnlyReqs = apiRequests.filter(r => r.url.includes('/api/'));
  const imageReqs = apiRequests.filter(r => r.type === 'image' || r.url.includes('_next/image'));
  const jsReqs = apiRequests.filter(r => r.type === 'script');

  console.log('=== API Requests ===');
  for (const req of apiOnlyReqs) {
    const duration = req.endTime ? req.endTime - req.startTime : '?';
    const shortUrl = req.url.replace('http://localhost:3000', '');
    const sizeKB = req.size ? (req.size / 1024).toFixed(1) + 'KB' : '?';
    console.log(`  [${req.status || '?'}] ${duration}ms | ${sizeKB} | ${shortUrl}`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`API requests: ${apiOnlyReqs.length}`);
  console.log(`Image requests: ${imageReqs.length}`);
  console.log(`JS bundles: ${jsReqs.length}`);
  console.log(`Total requests: ${apiRequests.length}`);

  // Print the timeline BEFORE sorting so it remains chronological.
  console.log(`\n=== Request Timeline ===`);
  for (const req of apiOnlyReqs) {
    const shortUrl = req.url.replace('http://localhost:3000', '');
    const start = req.startTime;
    const end = req.endTime || start;
    console.log(`  ${start}ms → ${end}ms (${end - start}ms): ${shortUrl}`);
  }

  // Sort a COPY so the original array (and the timeline above) are not mutated.
  const sorted = [...apiOnlyReqs].sort(
    (a, b) => (b.endTime || 0) - b.startTime - ((a.endTime || 0) - a.startTime)
  );
  if (sorted.length > 0) {
    console.log(`\nSlowest API request: ${sorted[0].url.replace('http://localhost:3000', '')} (${(sorted[0].endTime || 0) - sorted[0].startTime}ms)`);
  }

  // Wait for images to finish
  await page.waitForTimeout(3000);

  console.log(`\n=== Image Load Details ===`);
  for (const req of imageReqs) {
    const duration = req.endTime ? req.endTime - req.startTime : '?';
    const sizeKB = req.size ? (req.size / 1024).toFixed(1) + 'KB' : '?';
    const shortUrl = req.url.length > 80 ? req.url.substring(0, 80) + '...' : req.url;
    console.log(`  ${duration}ms | ${sizeKB} | ${shortUrl}`);
  }

  await browser.close();
  console.log('\n=== Done ===');
})();
