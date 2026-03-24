import BundleAnalyzer from '@next/bundle-analyzer';
import withSerwistInit from '@serwist/next';

const withBundleAnalyzer = BundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
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
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [390, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [32, 48, 64, 128, 192, 256, 384],
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
  async headers() {
    return [
      {
        source: '/_next/image',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
        ],
      },
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