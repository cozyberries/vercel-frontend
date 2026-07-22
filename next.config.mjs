import BundleAnalyzer from '@next/bundle-analyzer';
import withSerwistInit from '@serwist/next';

const withBundleAnalyzer = BundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

// Disable the SW in every environment that isn't an actual Vercel deployment.
//
// Why this is broader than just `NODE_ENV==='development'`:
//   `next start` runs with NODE_ENV=production, so the SW would otherwise be
//   installed on `http://localhost:3000`. Every `next build` changes the
//   Next.js buildId, which changes our SW cache-bucket names and triggers an
//   `activate` that wipes the old buckets. During a local kill→build→start
//   cycle a stale SW in the tab can race that: network is down (server
//   restarting) + old pages-cache bucket deleted + new bucket not populated
//   yet → Workbox throws `no-response: no-response` on the next navigation
//   (e.g. after the impersonation-exit reload). Real Vercel deployments can't
//   hit this because they're atomic — there is no "server is gone" window.
//
// Force-enable locally when you actually need to test PWA behaviour:
//   ENABLE_SW=1 npm run build && ENABLE_SW=1 npm run start
const isVercelDeployment = !!process.env.VERCEL;
const swExplicitlyEnabled = process.env.ENABLE_SW === '1';
const swDisabled =
  process.env.NODE_ENV === 'development' ||
  (!isVercelDeployment && !swExplicitlyEnabled);

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  reloadOnOnline: true,
  disable: swDisabled,
  // Ensure /offline is always precached so the fallback page never 404s
  additionalPrecacheEntries: [{ url: '/offline', revision: '1' }],
  // Don't precache API routes — they are handled at runtime in sw.ts
  exclude: [/\/api\//],
});

let userConfig = undefined
try {
  userConfig = await import('./v0-user-next.config')
} catch (e) {
  // ignore error
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    // minimumCacheTTL has no effect when unoptimized: true (/_next/image is bypassed).
    // Cache lifetime for pre-generated variants is controlled by Supabase Storage CDN headers.
  },
  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
    ...(process.env.NEXT_OPTIMIZE_PACKAGE_IMPORTS === 'true' && {
      optimizePackageImports: [
        "lucide-react",
        "framer-motion",
        "@supabase/supabase-js",
        "@tanstack/react-query",
        "sonner",
        "react-icons",
        "class-variance-authority",
      ],
    }),
  },
  env: {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  webpack: (config, { buildId, webpack: wp }) => {
    // Inject build ID into the service worker so cache names are versioned per deployment.
    // Old cache buckets are abandoned on activation and expire naturally via maxAgeSeconds.
    config.plugins.push(new wp.DefinePlugin({ __BUILD_ID__: JSON.stringify(buildId) }));
    return config;
  },
  async headers() {
    return [
      // Only in production: dev chunks change on every compile; immutable caching
      // causes ChunkLoadError when the browser keeps stale chunk URLs after a restart.
      ...(process.env.NODE_ENV === 'production'
        ? [
            {
              source: '/_next/static/:path*',
              headers: [
                {
                  key: 'Cache-Control',
                  value: 'public, max-age=31536000, immutable',
                },
              ],
            },
          ]
        : []),
      { source: '/api/categories',         headers: [{ key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' }] },
      { source: '/api/ages/options',        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' }] },
      { source: '/api/sizes/options',       headers: [{ key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' }] },
      { source: '/api/genders/options',     headers: [{ key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' }] },
      { source: '/api/categories/options',  headers: [{ key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' }] },
      { source: '/api/products',            headers: [{ key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=600' }] },
    ];
  },
}

mergeConfig(nextConfig, userConfig)

function mergeConfig(nextConfig, userConfig) {
  if (!userConfig) {
    return
  }

  for (const key in userConfig) {
    if (
      typeof nextConfig[key] === 'object' &&
      !Array.isArray(nextConfig[key])
    ) {
      nextConfig[key] = {
        ...nextConfig[key],
        ...userConfig[key],
      }
    } else {
      nextConfig[key] = userConfig[key]
    }
  }
}

export default withSerwist(withBundleAnalyzer(nextConfig))