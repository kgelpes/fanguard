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
    // Gas tank (server-only): private key of a small POL-funded wallet that
    // drips gas into a fan's embedded wallet before checkout, so a USDC-funded
    // wallet with 0 POL can still pay Polygon gas. Falls back to PRIVATE_KEY
    // (the same funded wallet the hedge/settler use). When unset, the drip is a
    // no-op and the fan must hold POL themselves. See lib/flow/gas-tank.ts.
    GAS_TANK_PRIVATE_KEY: z.string().optional(),
    // POL balance the gas drip tops a short wallet up to (default "0.05").
    FLOW_GAS_TARGET_POL: z.string().optional(),
    // Fee tank (server-only): private key of a treasury wallet that absorbs the
    // USDC→USDC.e swap spread, topping a fan's wallet up to the fee-inclusive
    // `fromAmount` so they pay exactly their premium. Falls back to PRIVATE_KEY;
    // must hold native USDC (+ a little POL for gas). When unset, the cover is a
    // no-op and the fan must hold the fee themselves. See lib/flow/fee-tank.ts.
    FEE_TANK_PRIVATE_KEY: z.string().optional(),
    // CoverPool settler key (server-only): signs every BuyPolicy quote and calls
    // openGame/resolve. Its address MUST equal the deployed CoverPool's settler.
    // Falls back to PRIVATE_KEY. /api/sign-policy 501s without it.
    SETTLER_PRIVATE_KEY: z.string().optional(),
    // Blink signer: P-256 PKCS8 private key (PEM as a single line with literal
    // \n) used by /api/sign-payment to sign deposit payloads. Server-only — the
    // matching public key is registered with Blink. The signer 501s without it.
    BLINK_MERCHANT_PRIVATE_KEY: z.string().min(1).optional(),
    // NameStone API key (server-only): issues the per-policy ENS certificate-of-
    // cover subname + text records gaslessly via NameStone's offchain resolver.
    // Get one (free, self-serve) at namestone.com and enable your
    // NEXT_PUBLIC_ENS_PARENT_DOMAIN there. /api/cover-certificate 501s without it;
    // the checkout still completes (the ENS step is best-effort).
    NAMESTONE_API_KEY: z.string().min(1).optional(),
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
    // Deployed CoverPool vault address (PUBLIC). When set, the checkout mints an
    // on-chain policy after the premium settles; when unset, that step is skipped.
    NEXT_PUBLIC_COVERPOOL_ADDRESS: z.string().optional(),
    // Which Blink hosted flow to open: "sandbox" (testnet, pay-sandbox.blink.cash)
    // or "production" (pay.blink.cash). Defaults to "production" in the SDK.
    NEXT_PUBLIC_BLINK_ENV: z.enum(["sandbox", "production"]).optional(),
    // Parent ENS name that per-policy certificates hang off of, e.g. "fanguard.eth"
    // (PUBLIC — used to build the resolvable name + the profile link). Must be the
    // domain you enabled in NameStone. When unset, the ENS certificate is skipped.
    NEXT_PUBLIC_ENS_PARENT_DOMAIN: z.string().optional(),
    // Which network the parent name lives on: "mainnet" or "sepolia" (PUBLIC —
    // only used to build the right app.ens.domains profile link). Default mainnet.
    NEXT_PUBLIC_ENS_NETWORK: z.enum(["mainnet", "sepolia"]).optional(),
    // Browser-side Polygon RPC (PUBLIC). Put a keyed endpoint (Alchemy/Infura)
    // here so wagmi doesn't fall back to viem's flaky default (polygon.drpc.org),
    // which intermittently 500s receipt polls with "Unknown block". Optional —
    // dynamic-provider.tsx already fails over to stable public nodes without it.
    NEXT_PUBLIC_POLYGON_RPC_URL: z.string().url().optional(),
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
    GAS_TANK_PRIVATE_KEY: process.env.GAS_TANK_PRIVATE_KEY,
    FLOW_GAS_TARGET_POL: process.env.FLOW_GAS_TARGET_POL,
    FEE_TANK_PRIVATE_KEY: process.env.FEE_TANK_PRIVATE_KEY,
    SETTLER_PRIVATE_KEY: process.env.SETTLER_PRIVATE_KEY,
    BLINK_MERCHANT_PRIVATE_KEY: process.env.BLINK_MERCHANT_PRIVATE_KEY,
    NAMESTONE_API_KEY: process.env.NAMESTONE_API_KEY,
    NEXT_PUBLIC_BLINK_MERCHANT_ID: process.env.NEXT_PUBLIC_BLINK_MERCHANT_ID,
    NEXT_PUBLIC_BLINK_ENV: process.env.NEXT_PUBLIC_BLINK_ENV,
    NEXT_PUBLIC_COVERPOOL_ADDRESS: process.env.NEXT_PUBLIC_COVERPOOL_ADDRESS,
    NEXT_PUBLIC_ENS_PARENT_DOMAIN: process.env.NEXT_PUBLIC_ENS_PARENT_DOMAIN,
    NEXT_PUBLIC_ENS_NETWORK: process.env.NEXT_PUBLIC_ENS_NETWORK,
    NEXT_PUBLIC_POLYGON_RPC_URL: process.env.NEXT_PUBLIC_POLYGON_RPC_URL,
  },
  emptyStringAsUndefined: true,
  // Set SKIP_ENV_VALIDATION=1 to skip (e.g. in Docker builds).
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
