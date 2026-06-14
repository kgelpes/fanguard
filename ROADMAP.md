# FanGuard — Roadmap (what's left to build)

Status snapshot as of 2026-06-14. See `CONTEXT.md` / `PRODUCT.md` for the vision.

## ✅ Done / working

- **Extension wedge** — StubHub event detection (schema.org JSON-LD + fallbacks), ticket-price
  scrape, deep-link into web checkout.
- **Pricing** — `@fanguard/pricing` pass-through quote (`premium = max(MIN, pBlowout·payout·MARKUP)`).
- **Checkout** — Dynamic embedded wallet, loss-framed UI, editable ticket price.
- **Payment** — Blink top-up + Dynamic Flow (any token/chain → USDC.e).
- **Hedge** — real Polymarket CLOB orders (pUSD, deposit wallet, ERC-1271), demo-sized.
- **CoverPool** — deployed to Polygon (`0x99A9414D0aCA6182Cc817842C63c7Aa8E81bBEbb`); tested
  (32 tests + solvency invariant).
- **On-chain mint** — `buyPolicy` wired into checkout (Flow settles to the fan → `approve` →
  `buyPolicy`), gated on `NEXT_PUBLIC_COVERPOOL_ADDRESS`.
- **Operator Desk** (`/desk`) — vault metrics, LP deposit/withdraw, games + **manual resolve**,
  policies + **manual claim/pay-out**.

## 🔜 What's left, prioritized

### P0 — Settler agent (auto-payout)

The Desk does `resolve` + `claim` by hand. Automate it: a worker that reads the final game result
(sports API, or Polymarket's UMA resolution), calls `resolve(gameId, margin)`, then `claim(policyId)`
for every blowout policy — so the fan is paid with zero action. This is the "before you leave the
stadium" beat. `gameId = deriveGameId(matchup, team)` (`apps/web/lib/cover-pool/game.ts`); the Desk's
`/api/desk` resolve/claim actions are the same calls — the agent can reuse them.

### P0 — Vault funding loop

The vault must hold LP collateral for `payout > premium` to mint (solvency). Today it's seeded by
hand via the Desk. Needs: a real LP onboarding/deposit story, exposure/utilization dashboard, and a
policy that the premium + hedge proceeds replenish the pool.

### P1 — Drift-capture trader (the edge)

The financial story (`CONTEXT.md`): the fan holds a frozen position; we run the live hedge and
partial-close as the combo drifts cheaper, locking the spread while staying covered. Unbuilt — even a
read-only "here's the reprice + the close it would do" panel on the Desk carries the pitch.

### P1 — Threshold accuracy

`/api/sign-policy` currently signs with a default threshold of 3 (`DEFAULT_BLOWOUT_THRESHOLD`). Wire
the real spread line from the trigger combo via `thresholdFromLine()` so `resolve` and the claim
condition match the actual market the cover was priced on.

### P2 — ENS certificate-of-cover

One resolvable subname per policy, with the cover terms in text records — the targeted ENS prize.
Mint on `buyPolicy` success (the `policyId` is already surfaced from the `PolicyBought` event).

### P2 — Real-size hedge execution

Hedge is capped at the Polymarket minimum. Price off the executable book (not the midpoint) and size
the order to the policy's coverage. Acknowledged caveat in `CONTEXT.md`.

### P3 — Hardening (demo debt)

- `/api/desk` and `/api/hedge` are **unauthenticated** (unlisted, demo only). Add an operator
  passcode/auth + rate limiting before any public exposure.
- Settler/hedge keys are env vars — move to a secrets manager / KMS; rotate via `setSettler`.
- Blink signer hardening checklist (session auth, destination-ownership checks).

### P3 — Polish / open questions

- Extension popup "Open dashboard" is a no-op → point it at `/desk`.
- **Fan gas**: `approve` + `buyPolicy` need POL in the embedded wallet — consider a paymaster /
  gasless so "crypto stays invisible".
- **Verify live**: that Dynamic Flow accepts a per-fan settlement destination (`settleToSource`) —
  the one piece untested until a real run.
