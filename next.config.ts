import type { NextConfig } from "next";
import { execSync } from "child_process";
import { withSentryConfig } from "@sentry/nextjs";

// Get git SHA at build time
let gitSha = "unknown";
try {
  gitSha = execSync("git rev-parse --short HEAD", {
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` },
  }).toString().trim();
} catch {
  // Not in a git repo or git not available
}

const nextConfig: NextConfig = {
  // ── Standalone output for Docker deployment ───────────────────────────
  // Produces a self-contained build in .next/standalone that includes
  // only the required dependencies, enabling efficient Docker images.
  output: 'standalone',

  // ── Dev performance: tree-shake barrel imports ─────────────────────────
  // lucide-react ships 1,400+ icons in one barrel  -  without this, every
  // `from 'lucide-react'` import compiles ALL icons on-demand.
  // recharts similarly ships a large barrel.  This setting tells Turbopack
  // to resolve individual exports, cutting dev compile times dramatically.
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns'],
  },

  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || "1.0.0",
    NEXT_PUBLIC_BUILD_SHA: gitSha,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },

  // Image optimization  -  allow Supabase storage URLs
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
  },

  // Enable gzip/brotli response compression
  compress: true,

  // Cache headers for static assets and API routes
  async headers() {
    return [
      // ── Security headers (all routes) ────────────────────────────────
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co https://*.supabase.in https://api.stripe.com https://*.ingest.sentry.io",
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
              "frame-ancestors 'none'",
              "form-action 'self'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join("; "),
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
      // ── Cache headers ────────────────────────────────────────────────
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Suppress Sentry CLI output during builds
  silent: true,

  // Sentry organisation and project (used for source map uploads)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Upload source maps for readable stack traces in Sentry
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
