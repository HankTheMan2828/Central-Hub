import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  assetPrefix: process.env.NODE_ENV === "production" ? "./" : undefined,
  devIndicators: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
