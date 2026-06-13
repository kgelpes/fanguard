import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Validate env at build/start time.
import "~/env";

// This monorepo is checked out in several places at once (Conductor worktrees +
// the root checkout). Without an explicit root, Turbopack infers it from the
// nearest lockfile and can latch onto a sibling checkout — which makes Next
// share that checkout's dev-server lock and refuse to start. Pin it to this
// workspace's monorepo root.
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: { root: workspaceRoot },
  // Internal workspace packages ship TypeScript source (no build step), so Next
  // must transpile them.
  transpilePackages: ["@fanguard/polymarket", "@fanguard/pricing"],
};

export default nextConfig;
