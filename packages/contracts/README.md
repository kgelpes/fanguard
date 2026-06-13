# @fanguard/contracts

Foundry contracts for FanGuard, targeting **Polygon mainnet (chain 137)**.

Right now this package contains only `HelloWorld.sol` — a throwaway used to prove the
build → test → simulate → deploy pipeline (FAN-11) before the real `CoverPool.sol` is
written. It has no product meaning.

## Prerequisites

[Foundry](https://book.getfoundry.sh/getting-started/installation):

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
```

`forge-std` is vendored under `lib/` (committed), so no extra install step is needed.

## Setup

```bash
cp .env.example .env
```

`.env` (gitignored) holds:

- `POLYGON_RPC_URL` — public Polygon RPC. Defaults to `https://polygon-bor-rpc.publicnode.com`
  (the older `polygon-rpc.com` is now gated).
- `PRIVATE_KEY` — deployer key. Generate a throwaway with `cast wallet new`, fund it with a
  little POL, paste the key in. **Never commit a funded key.**

## Build & test

```bash
pnpm --filter @fanguard/contracts build   # forge build
pnpm --filter @fanguard/contracts test    # forge test
```

## Deploy to Polygon mainnet

Load the env, then simulate before broadcasting:

```bash
set -a && . ./.env && set +a

# 1. Simulate (no spend) — confirms the script + RPC reach mainnet:
forge script script/HelloWorld.s.sol --rpc-url polygon

# 2. Broadcast (spends real POL for gas):
forge script script/HelloWorld.s.sol --rpc-url polygon --broadcast
# or: pnpm --filter @fanguard/contracts deploy:polygon

# 3. Read state back from the deployed address:
cast call <DEPLOYED_ADDRESS> "greeting()(string)" --rpc-url polygon
```

Deploy receipts are written to `broadcast/HelloWorld.s.sol/137/` (committed; `dry-run/` is
gitignored).

## Deployments (Polygon mainnet, chain 137)

| Contract   | Address | Tx |
|------------|---------|----|
| HelloWorld | [`0x78712875590bea3BC4af0b101cF970F38FfF8C6B`](https://polygonscan.com/address/0x78712875590bea3BC4af0b101cF970F38FfF8C6B) | [`0x964d5da3…d07d1592`](https://polygonscan.com/tx/0x964d5da3f95276632b8bafd178cb440b9c63f1c0514b9676e4f71b67d07d1592) |
