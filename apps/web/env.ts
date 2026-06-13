import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Add server-only vars here, e.g.
    // POLYMARKET_API_KEY: z.string().min(1),
  },
  client: {
    // Must be prefixed with NEXT_PUBLIC_ to be exposed to the browser.
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  emptyStringAsUndefined: true,
  // Set SKIP_ENV_VALIDATION=1 to skip (e.g. in Docker builds).
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
