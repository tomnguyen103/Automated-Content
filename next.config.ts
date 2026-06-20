import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "impulsive-user-paycheck.ngrok-free.dev"],
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
