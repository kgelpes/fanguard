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
    // Hedge desk: private key of the wallet that places the Polymarket hedge
    // (server-only). Its deposit wallet must be set up + funded with pUSD via
    // `packages/polymarket` scripts. The /api/hedge route 501s without it.
    HEDGE_PRIVATE_KEY: z.string().optional(),
    // Generic fallback for the hedge key (some deployments only set PRIVATE_KEY).
    // HEDGE_PRIVATE_KEY takes precedence when both are present.
    PRIVATE_KEY: z.string().optional(),
    // Polygon RPC for the hedge route. Defaults to a public endpoint.
    POLYGON_RPC_URL: z.string().url().optional(),
    // Blink signer: P-256 PKCS8 private key (PEM as a single line with literal
    // \n) used by /api/sign-payment to sign deposit payloads. Server-only — the
    // matching public key is registered with Blink. The signer 501s without it.
    BLINK_MERCHANT_PRIVATE_KEY: z.string().min(1).optional(),
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
    // Blink merchant id (PUBLIC — safe in client code). Powers the SDK preload
    // and is echoed by the signer. Without it, the deposit step shows a setup hint.
    NEXT_PUBLIC_BLINK_MERCHANT_ID: z.string().min(1).optional(),
    // Which Blink hosted flow to open: "sandbox" (testnet, pay-sandbox.blink.cash)
    // or "production" (pay.blink.cash). Defaults to "production" in the SDK.
    NEXT_PUBLIC_BLINK_ENV: z.enum(["sandbox", "production"]).optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID: process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID,
    NEXT_PUBLIC_FLOW_TEST_PREMIUM_USD: process.env.NEXT_PUBLIC_FLOW_TEST_PREMIUM_USD,
    DYNAMIC_API_TOKEN: process.env.DYNAMIC_API_TOKEN,
    FLOW_SETTLEMENT_ADDRESS: process.env.FLOW_SETTLEMENT_ADDRESS,
    FLOW_CHECKOUT_ID: process.env.FLOW_CHECKOUT_ID,
    HEDGE_PRIVATE_KEY: process.env.HEDGE_PRIVATE_KEY,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    POLYGON_RPC_URL: process.env.POLYGON_RPC_URL,
    BLINK_MERCHANT_PRIVATE_KEY: process.env.BLINK_MERCHANT_PRIVATE_KEY,
    NEXT_PUBLIC_BLINK_MERCHANT_ID: process.env.NEXT_PUBLIC_BLINK_MERCHANT_ID,
    NEXT_PUBLIC_BLINK_ENV: process.env.NEXT_PUBLIC_BLINK_ENV,
  },
  emptyStringAsUndefined: true,
  // Set SKIP_ENV_VALIDATION=1 to skip (e.g. in Docker builds).
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
