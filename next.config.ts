import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: ['pdfjs-dist'],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
