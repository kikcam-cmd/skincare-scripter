import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static ships a native binary that Next's file tracer doesn't pick up
  // automatically — without this, Vercel deployments fail with "ffmpeg: command
  // not found" the first time the pipeline runs.
  outputFileTracingIncludes: {
    "app/api/videos/**": ["./node_modules/ffmpeg-static/**"],
  },
};

export default nextConfig;
