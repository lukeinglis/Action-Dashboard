import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Vercel hard-caps function request bodies at 4.5MB regardless of this
      // setting; client-side compression keeps uploads under that ceiling,
      // this just raises Next's own default (1MB) to match the headroom.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
