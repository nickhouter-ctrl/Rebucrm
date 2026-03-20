import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
