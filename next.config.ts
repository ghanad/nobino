import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["ldapts"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
