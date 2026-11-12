import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@libsql/client", "libsql", "drizzle-orm"],
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@libsql/**/*",
      "./node_modules/libsql/**/*",
      "./node_modules/drizzle-orm/**/*",
    ],
  },
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
