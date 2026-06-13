import type { NextConfig } from "next";

// Validate env at build/start time.
import "~/env";

const nextConfig: NextConfig = {
  reactCompiler: true,
};

export default nextConfig;
