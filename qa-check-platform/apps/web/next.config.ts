import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  turbopack: { root: path.resolve(process.cwd(), "../..") },
  async rewrites() {
    const origin = process.env.API_URL ?? "http://localhost:4000";
    return [
      { source: "/api/v1/auth/:path*", destination: `${origin}/api/v1/auth/:path*` },
      { source: "/api/v1/projects/:path*", destination: `${origin}/api/v1/projects/:path*` },
    ];
  },
};

export default config;
