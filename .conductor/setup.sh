#!/usr/bin/env bash
#
# Conductor workspace setup. Runs from the new workspace dir every time a
# workspace is created. Installs deps and pulls env vars from Vercel so a fresh
# worktree boots with the same secrets as the deployed app.
#
# One-time prerequisites (do these once in the repo root, they persist):
#   1. Authenticate the Vercel CLI:   pnpm dlx vercel@latest login
#   2. Link apps/web to its project:  pnpm dlx vercel@latest link --cwd apps/web
# After that, every new workspace auto-pulls env via this script.
#
# Auth note: `vercel login` is stored globally on your Mac, so all workspaces
# inherit it. In cloud/CI, set VERCEL_TOKEN instead (the CLI reads it).

set -euo pipefail

echo "→ Installing dependencies…"
pnpm install

# Keep the repo root checkout fresh too (non-fatal if it can't fast-forward).
if [ -n "${CONDUCTOR_ROOT_PATH:-}" ]; then
  git -C "$CONDUCTOR_ROOT_PATH" fetch --prune origin >/dev/null 2>&1 || true
fi

# Vercel env pull is local-only — skip it in cloud workspaces.
if [ "${CONDUCTOR_IS_LOCAL:-1}" != "1" ]; then
  echo "→ Cloud workspace — skipping Vercel env pull."
  exit 0
fi

echo "→ Pulling env vars from Vercel for apps/web…"

# A fresh worktree won't have the gitignored .vercel link. Reuse the one from
# the repo root if present so we don't have to re-link every workspace.
if [ ! -f apps/web/.vercel/project.json ] && \
   [ -n "${CONDUCTOR_ROOT_PATH:-}" ] && \
   [ -f "$CONDUCTOR_ROOT_PATH/apps/web/.vercel/project.json" ]; then
  mkdir -p apps/web/.vercel
  cp "$CONDUCTOR_ROOT_PATH/apps/web/.vercel/project.json" apps/web/.vercel/project.json
fi

if [ ! -f apps/web/.vercel/project.json ] && [ -z "${VERCEL_PROJECT_ID:-}" ]; then
  cat <<'EOF'
⚠️  apps/web is not linked to a Vercel project yet — skipping env pull.
    Run this once in the repo root (it persists for future workspaces):
        pnpm dlx vercel@latest login
        pnpm dlx vercel@latest link --cwd apps/web
EOF
  exit 0
fi

# Next.js dev loads .env.local. We pull the `preview` environment because that's
# where this project's secrets live (Development is empty). Override by exporting
# VERCEL_PULL_ENV=production|development before setup if you need a different set.
if pnpm dlx vercel@latest env pull .env.local \
      --environment="${VERCEL_PULL_ENV:-preview}" --yes --cwd apps/web; then
  echo "✓ Wrote apps/web/.env.local from Vercel."
else
  cat <<'EOF'
⚠️  Vercel env pull failed (not logged in, or no network).
    Authenticate once with:  pnpm dlx vercel@latest login
    (or set VERCEL_TOKEN), then re-run setup from the workspace menu.
EOF
fi
