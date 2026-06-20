import type { NextConfig } from "next";

export function parseAllowedDevOrigins(value = process.env.NEXT_ALLOWED_DEV_ORIGINS) {
  return (
    value
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []
  );
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", ...parseAllowedDevOrigins()],
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
