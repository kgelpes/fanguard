import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Dynamic environment API token (dyn_…) for Fireblocks Flow checkout creation.
    // app.dynamic.xyz → Developers → API Tokens (Flow must be enabled). Optional:
    // the checkout page still loads without it; the Flow payment route returns a
    // 501 with setup hints until it's set.
    DYNAMIC_API_TOKEN: z.string().min(1).optional(),
    // Where settled USDC lands. Defaults to the Fanguard treasury wallet
    // (see lib/flow/config.ts); override to point at the CoverPool contract later.
    FLOW_SETTLEMENT_ADDRESS: z.string().optional(),
    // Reuse a pre-created Flow checkout id (skips create-on-first-payment).
    FLOW_CHECKOUT_ID: z.string().optional(),
  },
  client: {
    // Must be prefixed with NEXT_PUBLIC_ to be exposed to the browser.
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    // Dynamic embedded-wallet environment ID (app.dynamic.xyz → Developers → Overview).
    NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID: z.string().min(1),
    // TEST ONLY: cap the actual Flow charge to this USD amount (e.g. 0.05) while
    // the real premium still drives the loss-framed UI. Remove once the
    // Polymarket-funded payout is wired up so fans pay the true premium.
    NEXT_PUBLIC_FLOW_TEST_PREMIUM_USD: z.coerce.number().positive().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID: process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID,
    NEXT_PUBLIC_FLOW_TEST_PREMIUM_USD: process.env.NEXT_PUBLIC_FLOW_TEST_PREMIUM_USD,
    DYNAMIC_API_TOKEN: process.env.DYNAMIC_API_TOKEN,
    FLOW_SETTLEMENT_ADDRESS: process.env.FLOW_SETTLEMENT_ADDRESS,
    FLOW_CHECKOUT_ID: process.env.FLOW_CHECKOUT_ID,
  },
  emptyStringAsUndefined: true,
  // Set SKIP_ENV_VALIDATION=1 to skip (e.g. in Docker builds).
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
