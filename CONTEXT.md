# FanGuard — Project Context

Drop-in context for anyone (or any agent) working on this repo. Read this first.

## One line

Insurance for when you GO to the game and your team gets cooked. One tap at ticket
checkout; if your night gets ruined by a blowout, you get paid before you leave the stadium.

## The actual problem

Ticket insurance today covers if you *can't attend* (illness, travel). Nothing covers
the worse, more common thing: you show up, pay $1,800 for France vs Senegal, and it's
4–0 in 20 minutes. You didn't lose your ticket — you lost your night. That's uninsured.

## Why now (the hook)

This week a Spanish football club (Osasuna) hedged its own relegation risk through a
Kalshi prediction market because the pricing beat traditional reinsurance — reportedly
the first time real-world risk was laid off through a prediction market. FanGuard is that
same move, retailed for the fan in the stands. Institutions already do it; we bring it to
normal people, behind one button.

## How it works (the honest mechanism)

We are NOT an insurer taking your risk. We are a **pass-through hedge + distribution layer**.

1. Fan buys cover ("protect your night, $90") at ticket checkout.
2. Behind the button, the offsetting position already exists on a prediction market
   (Polymarket) — the "blowout" combo is priced there by the crowd.
3. We take that position. The crowd underwrites the payout; we package + manage it.
4. Game ends → an agent reads the result → if it's a blowout, payout hits the fan's
   wallet automatically. No claim form. The scoreboard IS the claim.

We charge the market price + a thin packaging fee (~2–5%). The value we add is
distribution and UX: the fan never opens a prediction market, never picks a combo,
never manages a position, never files a claim.

## The trigger: why "blowout" and why a combo

- We deliberately insure ONE objective, public, undisputed trigger: a blowout
  (big margin). No judgment calls, no claims fraud, no adverse selection (game outcomes
  are public info), no moral hazard (the fan can't throw the game). All the hard parts
  of insurance are structurally absent.
- Soccer problem: single spread lines cap at ±2.5 and "lose by 3+" sits ~19% — too
  common to fund a payout that feels worth it. FIX: use Polymarket's **Combo** feature
  to stack legs (e.g. France -2.5 AND Senegal scoreless) → a rare (~5–8%) joint event.
  Rare trigger = cheap = the same small premium funds a near-full-ticket payout.
- Rule: match the combo to "my night was ruined" (blown out AND no joy), not merely an
  improbable scoreline (a 4–2 thriller is rare-ish but was a GREAT match — bad trigger).

## Pricing model

- We don't price risk — the market does. We READ the combo's implied probability and
  pass it through. `pBlowout = 1 / comboMultiplier`.
- Default target: full-ticket payout. Solve `premium = pBlowout × payout × MARKUP` with
  payout = ticket price. If that premium exceeds a tolerable % of ticket (trigger too
  common), step the payout down until it fits.
- `MARKUP = 1.15` for the demo (thin, so the card feels like a steal). Production tunes
  up toward category norms (ticket insurance runs 3–5× markup; loss ratios 20–30%).
- `MIN_PREMIUM` floor so cheap tickets don't make sub-dollar policies.
- Hard rule: payout must always stay funded by `premium/(pBlowout×markup)`. We hide the
  probability from the USER, but the math stays real or the pool goes insolvent.

## Consumer psychology (why the card looks the way it does)

Research-backed, drives the UI:
- HIDE the probability. Showing "10% chance" triggers System-2 EV math, and on the math
  all insurance looks like a bad bet. Probability neglect is the friend; don't break it.
- LOSS-FRAME it. "Protect your $1,323 night" beats "win $830." Sell protecting what they
  already have, not winning a prize.
- Premium should feel trivial, payout should anchor against the full ticket loss.
- Sell the FEELING (peace of mind), not the financial sum. No "% of ticket" labels —
  percentages invite arithmetic. Dollars only.
- The combo legs can be shown in plain English ("if France wins big and Senegal doesn't
  score") — transparency of WHAT triggers, opacity of HOW LIKELY.

## The edge (the financial-engineering twist)

**The fan's policy is non-transferable. Our hedge is not.**
- The fan buys a frozen position and holds to expiry — they can't and won't manage it.
- We hold the offsetting hedge on a live market and CAN trade it the whole window.
- If the combo drifts cheaper after purchase (blowout becomes less likely), our hedge is
  over-funded vs our liability → we partially close, lock the difference, stay covered.
- One-way market: the fan is forced to hold, we trade freely → we capture the time-value
  and repricing. That's structurally why the desk makes money off retail flow.
- This is the real business, NOT a packaging fee. Pitch line: "the fan holds a frozen
  position; we run a live desk against it and the spread is ours."
- Drift-capture (partial close while staying covered) keeps us risk-free. Deliberately
  over-hedging to run a prop position would re-introduce risk — that's a CHOICE, not the
  default story. Don't blend the two in the pitch.

## Architecture

```
Fan on StubHub
  → Extension detects the event (schema.org/Event JSON-LD, no DOM scraping)
  → Injected prompt: "Protect your night → $90"
  → deep-link into web checkout (game + ticket price prefilled)
  → Dynamic embedded wallet (no seed phrase)
  → Blink one-tap deposit (pull premium) → Dynamic Flow (any token → USDC settle)
  → Polygon vault (CoverPool.sol): mints policy + ENS certificate subname
  → Polymarket hedge taken (offsetting combo)  [demo: small/stub]
  → drift-capture trader manages the live hedge  [demo: small/stub]
  → game ends → settler agent reads result → auto-payout if blowout
```

## Why Polygon (not Arc)

The hedge lives on Polymarket, which is on Polygon. Co-locating the vault and the hedge
on the same chain lets us hold the hedge position as collateral, perfectly matched →
true zero-risk pass-through. Building on Arc would split vault from hedge across chains,
break direct collateralization, and force us to self-underwrite (real risk). Arc's $5k
prize is not worth reintroducing the risk we designed out.

## Monorepo

```
fanguard/
├── apps/
│   ├── extension/   # StubHub event detection + injected prompt (THE WEDGE)
│   ├── web/         # checkout target (prefilled from extension) + payout screen
│   └── settler/     # Dynamic server-wallet agents: resolver + drift-capturer
├── packages/
│   ├── contracts/   # Foundry — CoverPool.sol (the whole product)
│   ├── pricing/     # pure TS — combo → premium/payout, drift-capture math
│   └── shared/      # types, ABI, deployed addresses
```

## CoverPool surface (keep it minimal)

```
deposit(amount)                          // LP capital in
withdraw(shares)                         // unlocked capital out
buyPolicy(gameId, payout, premium, sig)  // pull premium, record policy, check exposure cap, verify settler sig
openGame(gameId, threshold, exposureCap) // settler only
resolve(gameId, margin)                  // settler only — writes final margin
claim(policyId)                          // pay if blowout, else nothing
```
Per-game exposure cap = the solvency story. Sum of active payouts per game can't exceed
the cap; buyPolicy reverts past it.

## Sponsors targeted (ETHGlobal NY 2026) — all Polygon/EVM, all load-bearing

- **Dynamic — Best Money App ($2k):** embedded wallet, fan never sees crypto.
- **Dynamic — Best Use of Flow ($3k):** pay premium in any token/chain, settle USDC.
  Their copy literally names "prediction markets."
- **Blink ($3k):** one-tap premium deposit, removes the conversion-killing friction.
  Sits before Flow (Blink = pull funds; Flow = any-token→USDC settle).
- **ENS (Most Creative / Integrate, $5–6k pools):** each policy a named, publicly
  resolvable certificate-of-cover subname with terms in text records.

Dropped on purpose: Arc (breaks Polygon co-location), LI.FI (complexity we designed out),
World (no sybil surface in pass-through), Canton (tranche idea is dead), Unlink (no
privacy need — we WANT cover publicly verifiable).

## Demo arc (3 min)

1. Open ON StubHub — the prompt appears over a real event page. (The wedge, 15s.)
2. The hook: this week a club hedged relegation via a prediction market; we do it for fans.
3. Buy: one tap, embedded wallet, $90 protects an $1,800 night.
4. The edge: show the hedge taken, the combo reprice, the partial close locking the spread.
5. The payout: resolve against a REAL game result this weekend → "Rough match. Your
   $1,323 is back in your wallet." (The emotional peak.)
- Pre-record a backup video. Extension + live wallets + agents = max failure surface.

## Honest caveats (have these ready for judges)

- Can't execute real combo positions at size in 24h (thin books). Demo executes small /
  stubs the hedge and SHOWS the position it would take; live execution is roadmap.
- Our addressable volume scales with prediction-market liquidity — which post-Kalshi-
  sports-boom is the fastest-growing order-book depth around. We're a levered bet on that.
- We price off the combo midpoint, which ignores bid/ask + depth; MARKUP partly absorbs
  this. Roadmap is pricing off the executable book.

## The tweet

> ticket insurance exists for if you can't go.
> nothing exists for if you go and your team gets cooked 4-0 in 20 mins.
> so we built FanGuard. one tap on StubHub. if your night gets ruined, you get paid
> before you leave the stadium. we don't gamble — the prediction market already prices
> your misery, we just package it.
> you can't insure your team being good. you can insure your night.
