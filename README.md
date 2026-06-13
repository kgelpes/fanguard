# Fanguard

Turborepo monorepo: a Next.js web app and a Chrome/Firefox extension that overlays
Polymarket odds onto live-event pages.

## Stack

- **Turborepo** + **pnpm** workspaces (shared versions via the `catalog:` in `pnpm-workspace.yaml`)
- **TypeScript** everywhere, with `~/*` aliased to each app's root
- **React 19** + **React Compiler** (`babel-plugin-react-compiler`)
- **Tailwind CSS v4** + **shadcn/ui** (new-york, neutral)
- **t3-env** for typesafe env vars (`@t3-oss/env-nextjs` / `@t3-oss/env-core`)
- **Next.js 16** (`apps/web`) · **WXT** (`apps/extension`)

## Layout

```
apps/
  web/         Next.js 16 app router
  extension/   WXT extension (popup + StubHub content-script overlay)
packages/      (shared packages go here)
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
