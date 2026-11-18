import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The addresses of the screens Home replaced.
  async redirects() {
    return ["/dashboard", "/trips"].map((source) => ({
      source,
      destination: "/home",
      permanent: false,
    }));
  },
};

export default nextConfig;
