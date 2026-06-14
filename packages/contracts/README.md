# @fanguard/contracts

Foundry contracts for FanGuard, targeting **Polygon mainnet (chain 137)**.

- **`CoverPool.sol`** — the product contract. A pass-through blowout-cover vault: LPs
  deposit USDC.e and earn the premiums fans pay; each policy pays a fixed payout if its
  game resolves as a blowout. See [CoverPool](#coverpool) below.
- **`HelloWorld.sol`** — a throwaway used to prove the build → test → simulate → deploy
  pipeline (FAN-11). No product meaning; kept as a reference deploy.

The package vendors **only `forge-std`** — no OpenZeppelin. `CoverPool` therefore hand-rolls
its minimal ERC-20 interface, safe-transfer helper, reentrancy guard, and EIP-712 signature
verification rather than pulling in a dependency. Everything is in collateral base units
(USDC.e has 6 decimals); there are no 18-decimal assumptions.

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

To deploy **CoverPool** instead, set `COLLATERAL_TOKEN` / `OWNER` / `SETTLER` in `.env`
(see `.env.example`; all have sensible defaults — USDC.e collateral, deployer as owner +
settler) and run:

```bash
set -a && . ./.env && set +a
forge script script/CoverPool.s.sol --rpc-url polygon            # simulate
forge script script/CoverPool.s.sol --rpc-url polygon --broadcast # deploy
# or: pnpm --filter @fanguard/contracts deploy:coverpool
cast call <ADDRESS> "settler()(address)" --rpc-url polygon        # read back
```

## CoverPool

A pass-through blowout-cover vault. LPs deposit USDC.e and earn premiums; fans buy policies
that pay a fixed `payout` if their game resolves as a blowout. A `gameId` encodes one
insurable trigger (a fixture + the insured team), so a single `threshold` and final `margin`
(goals/points the insured team lost by; `0` if it did not lose) describe a game, and
`blowout = margin >= threshold`.

```
deposit(amount)                                           // LP capital in  -> shares
withdraw(shares)                                          // unlocked capital out
openGame(gameId, threshold, exposureCap)                  // settler only
buyPolicy(gameId, payout, premium, deadline, nonce, sig)  // pull premium, mint policy
resolve(gameId, margin)                                   // settler only; writes margin
claim(policyId)                                           // pay holder if blowout, else 0
```

**Roles.** `owner` (cold key) can rotate the `settler` (hot agent). The settler signs every
`buyPolicy` quote and is the only caller of `openGame` / `resolve`.

**Solvency.** A per-game `exposureCap` bounds the sum of a game's payouts; on top of that
every `buyPolicy` enforces `lockedExposure + payout <= totalAssets + premium`, and LP
`withdraw` is capped at `freeAssets = totalAssets - lockedExposure`. Together these keep
`lockedExposure <= totalAssets` at all times (asserted by the fuzz/invariant test), so every
reserved payout is fully backed by collateral the pool actually holds.

**Settler quote (EIP-712).** The settler is the pricing oracle: it signs the exact economics
of each policy so callers can't mint mispriced or replayed cover. Domain
`("FanGuard CoverPool", "1", chainId, contract)`; typed struct:

```
BuyPolicy(address buyer,uint256 gameId,uint256 payout,uint256 premium,uint256 nonce,uint256 deadline)
```

`buyer` is bound to `msg.sender`, `nonce` must equal the on-chain per-buyer `nonces[buyer]`
(consumed on success → no replay), and the quote expires at `deadline`.

**Deliberate hackathon simplifications** (documented in the contract NatSpec): unclaimed
blowout exposure stays locked (no sweep); `claim` pays the holder regardless of caller (so the
settler agent can auto-claim); no fee-on-transfer support; no pause; the settler is trusted.

## Deployments (Polygon mainnet, chain 137)

| Contract   | Address | Tx |
|------------|---------|----|
| HelloWorld | [`0x78712875590bea3BC4af0b101cF970F38FfF8C6B`](https://polygonscan.com/address/0x78712875590bea3BC4af0b101cF970F38FfF8C6B) | [`0x964d5da3…d07d1592`](https://polygonscan.com/tx/0x964d5da3f95276632b8bafd178cb440b9c63f1c0514b9676e4f71b67d07d1592) |
| CoverPool  | _not yet deployed_ | — |
