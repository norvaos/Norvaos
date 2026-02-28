import type { NextConfig } from "next";
import { execSync } from "child_process";

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
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || "1.0.0",
    NEXT_PUBLIC_BUILD_SHA: gitSha,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },

  // Image optimization — allow Supabase storage URLs
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

export default nextConfig;
