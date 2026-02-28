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
};

export default nextConfig;
