import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/**/*': ['./public/fonts/**/*'],
  },
};

export default nextConfig;
