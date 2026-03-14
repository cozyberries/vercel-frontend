import BundleAnalyzer from '@next/bundle-analyzer';
const withBundleAnalyzer = BundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

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
    formats: ['image/avif', 'image/webp'],
    // Capped at 1920 — screens beyond this are rare and the savings are huge
    deviceSizes: [390, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [32, 48, 64, 128, 192, 256, 384],
    // Tell Next.js to cache optimised images for 7 days server-side
    minimumCacheTTL: 604800,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'aqvcyyhuqcjnhohaclib.supabase.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
    // Faster cold start & smaller bundles — tree-shake barrel imports
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "@supabase/supabase-js",
      "@tanstack/react-query",
      "sonner",
      "react-icons",
      "class-variance-authority",
    ],
  },
  env: {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  async headers() {
    return [
      // ── Optimised images: 1 hour cache + 1 day stale-while-revalidate (remote images may be mutable at same URL) ──
      {
        source: '/_next/image',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
        ],
      },
      // ── Static assets ──
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Reference data — changes rarely, cache 1 hour, serve stale for 24 h while revalidating
      { source: '/api/categories',         headers: [{ key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' }] },
      { source: '/api/ages/options',        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' }] },
      { source: '/api/sizes/options',       headers: [{ key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' }] },
      { source: '/api/genders/options',     headers: [{ key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' }] },
      { source: '/api/categories/options',  headers: [{ key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' }] },
      // Product listing — shorter TTL since prices/stock can change
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

export default withBundleAnalyzer(nextConfig)
