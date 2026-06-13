# @fanguard/web

Next.js 16 (App Router) web app: fixture lookup → blowout-combo pricing → a `/checkout`
flow powered by a **Dynamic** embedded wallet on **Polygon mainnet**.

## Run

```bash
cp .env.example .env.local        # set NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID
pnpm --filter @fanguard/web dev   # http://localhost:3000
```

`NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` is required (the env is validated at startup). Get it
from [app.dynamic.xyz](https://app.dynamic.xyz); enable EVM + embedded wallets, add the
**Polygon** network, and allowlist your dev origin under **Security → Origins** (Dynamic
matches the exact origin **including port** — if the dev server isn't on the port you
allowlisted, login API calls fail).

## Routes

- `/` — fixture lookup (`components/fixture-lookup.tsx`). Each blowout-combo card has a
  **"Cover {team}"** button linking to checkout for the opposing fan.
- `/checkout?q=<fixture>&team=<myTeam>[&shutout=1]` — the cover checkout.
- `GET /api/fixtures?q=…[&shutout=1]` — resolves a fixture to Polymarket combos.

## Checkout flow

1. `app/checkout/layout.tsx` mounts `DynamicProvider`
   (`components/providers/dynamic-provider.tsx`) — scoped to `/checkout` so Dynamic's bundle
   stays off the rest of the app. Provider stack:
   `DynamicContextProvider → WagmiProvider → QueryClientProvider → DynamicWagmiConnector`,
   wagmi `createConfig` pinned to viem's `polygon` (chain 137).
2. `app/checkout/page.tsx` reads `q`/`team` from the URL, re-resolves the fixture via
   `/api/fixtures`, and prices it with `quoteCover()` from `@fanguard/pricing`. The summary
   is **loss-framed** (dollars only, probability hidden): "Protect your $X night" + premium.
3. Login is `<DynamicWidget/>`; the connected embedded wallet is read with wagmi
   (`useAccount`, `useSignMessage`). Paying the premium (Dynamic Flow → USDC) is the next
   milestone.

## Notes

- `@fanguard/polymarket` and `@fanguard/pricing` ship raw TS, so they're listed in
  `transpilePackages` in `next.config.ts`.
- Pricing constants (`MARKUP`, `MIN_PREMIUM`, `FALLBACK_PAYOUT`) live in `@fanguard/pricing`
  — the single source of truth shared with the extension overlay.
