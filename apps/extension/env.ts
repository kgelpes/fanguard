import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// WXT exposes vars prefixed with WXT_ (and VITE_) on import.meta.env.
// Public/client vars here use the WXT_PUBLIC_ prefix.
export const env = createEnv({
  clientPrefix: "WXT_PUBLIC_",
  client: {
    WXT_PUBLIC_API_URL: z.string().url().optional(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
