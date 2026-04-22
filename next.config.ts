import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},

  typescript: {
    ignoreBuildErrors: true,
  },

  experimental: {
    serverActions: {
      // Default is 1MB — tekening-PNG's (A4 scale 2) zijn 1-3MB per stuk,
      // dus upload faalt stil. Verhoog naar 20MB voor leverancier PDF/PNG uploads.
      bodySizeLimit: '20mb',
    },
  },
};

export default nextConfig;
