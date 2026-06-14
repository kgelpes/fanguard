# FanGuard

Turborepo monorepo for FanGuard — one-tap "insure your night" blowout cover. A
Chrome/Firefox extension overlays Polymarket odds onto live-event pages, and a Next.js
web app prices the cover and runs the `/checkout` flow: the fan logs in with a **Dynamic**
embedded wallet (no seed phrase) and pays the premium in USDC on **Polygon mainnet**.

## Stack

- **Turborepo** + **pnpm** workspaces (shared versions via the `catalog:` in `pnpm-workspace.yaml`)
- **TypeScript** everywhere, with `~/*` aliased to each app's root
- **React 19** + **React Compiler** (`babel-plugin-react-compiler`)
- **Tailwind CSS v4** + **shadcn/ui** (new-york, neutral)
- **t3-env** for typesafe env vars (`@t3-oss/env-nextjs` / `@t3-oss/env-core`)
- **Next.js 16** (`apps/web`) · **WXT** (`apps/extension`)
- **Dynamic** embedded wallets (`@dynamic-labs/*`) bridged to **wagmi** + **viem** (web `/checkout`)

## Layout

```
apps/
  web/         Next.js 16 app router — fixture lookup + /checkout (Dynamic embedded wallet)
  extension/   WXT extension (popup + StubHub content-script overlay)
packages/
  polymarket/  Gamma API client — fixture → spread markets → per-team blowout combos
  pricing/     pure-TS quoteCover() — combo → premium/payout (shared by web + extension)
  contracts/   Foundry — Polygon mainnet (CoverPool to come)
```

## Commands

```bash
pnpm install        # installs all workspaces; runs `wxt prepare` for the extension
pnpm dev            # runs every app's dev task via Turbo
pnpm build          # builds all apps
pnpm typecheck      # tsc across the monorepo
pnpm format         # prettier write
```

Per app:

```bash
pnpm --filter @fanguard/web dev          # Next.js on :3000
pnpm --filter @fanguard/extension dev    # WXT dev (Chrome); add :firefox for Firefox
```

## Adding shadcn components

Run from inside an app so it picks up that app's `components.json`:

```bash
cd apps/web && pnpm dlx shadcn@latest add card
cd apps/extension && pnpm dlx shadcn@latest add card
```

## Env vars

Copy each app's `.env.example`, then edit `apps/web/env.ts` / `apps/extension/env.ts`
to add typed variables. Web client vars need the `NEXT_PUBLIC_` prefix; extension
client vars need the `WXT_PUBLIC_` prefix.

`apps/web` requires a **Dynamic** environment ID for the checkout:

```bash
cp apps/web/.env.example apps/web/.env.local
# set NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID
```

Get the ID from [app.dynamic.xyz](https://app.dynamic.xyz) (Developers → Overview). In the
dashboard: enable **EVM** + **embedded wallets**, add the **Polygon** mainnet network, and
add your dev origin (e.g. `http://localhost:3000`) under **Security → Origins** — Dynamic
gates SDK calls by exact origin **including port**, so a mismatched port breaks login.

## Checkout flow (`apps/web`)

`/checkout?q=<fixture>&team=<myTeam>` is reachable from the fixture-lookup combo cards
("Cover {team}"). It re-resolves the fixture, prices the cover with `@fanguard/pricing`
(`quoteCover`), and shows a loss-framed premium. `DynamicProvider`
(`components/providers/dynamic-provider.tsx`) wraps the route with
`DynamicContextProvider → WagmiProvider → QueryClientProvider → DynamicWagmiConnector`, so
the page reads the embedded wallet via wagmi hooks. See `apps/web/README.md` for details.

Paying the premium (Dynamic Flow → USDC settlement) is the next milestone.
