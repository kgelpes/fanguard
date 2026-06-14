# Product

## Register

product

## Users

**The fan (primary).** Someone at sports-ticket checkout — usually on StubHub, usually on a
phone — who has just spent real money on tickets and is deciding, in seconds, whether to
"protect their night." They are **not** crypto-native: no seed phrases, no wallets, no
prediction-market accounts, often no idea what USDC or Polygon are. They're emotional
(excited about the game, anxious about a blowout), distracted, and impatient. The decision
must feel obvious and safe or they bounce.

**The operator (secondary).** You and the hedge desk running the pass-through position on
Polymarket behind the button — the side that needs honest numbers (premium, payout, exposure,
drift) even though the fan never sees them.

## Product Purpose

FanGuard sells one-tap "insure your night" blowout cover at ticket checkout. The fan pays a
small premium; if their team gets blown out, the payout hits automatically before they leave
the stadium — no claim form, the scoreboard is the claim. Behind the button, the offsetting
position already exists on Polymarket; FanGuard takes it, packages it, and manages it. **We
are a pass-through hedge + distribution layer, not an insurer taking risk, and not a betting
product.**

Success on any given screen = the fan converts in **one tap** without ever feeling like
they're placing a bet or touching crypto. The embedded wallet, USDC, the chain, the
signatures, the prediction-market mechanics all stay invisible. What the fan feels is: *my
$250 night is protected for $5.*

## Brand Personality

**Warm · human · fan-energy.** This talks to the fan in the stands, not a policyholder or a
bettor. Voice is plain-spoken, reassuring, and a little bit on-your-side — "we've got your
night" — never corporate, never hype. Dollars, not percentages. Outcomes in plain English
("if Saudi Arabia wins big"), never odds. The emotional target is **peace of mind**: the
premium should feel trivial, the protected amount should anchor to what they'd lose, and the
payout moment should feel like a friend coming through, not a slot machine paying out.

## Anti-references

All four are explicitly out of bounds:

- **Gambling / sportsbook** (DraftKings, FanDuel, bet slips): neon, live odds, parlay hype,
  green-on-black "you could win" framing. We are not a wager; never show odds or invite EV math.
- **Crypto / web3 degen** (DeFi dashboards, wallet UIs): price charts, gas/network jargon,
  truncated wallet addresses as hero content, dark-mode-neon, "connect wallet" energy. The
  crypto is plumbing — keep it offstage.
- **Generic SaaS dashboard**: sterile templated cards-everywhere, gray-on-gray, the
  big-metric hero, components that look AI-generated. Earned familiarity, not blandness.
- **Heavy insurance / legalese**: dense forms, fine print, disclaimers, cold institutional
  blue. Trust comes from clarity and warmth, not from looking like an insurer.

## Design Principles

1. **Protect, don't bet.** Every screen is loss-framed and dollars-only. Show *what* triggers
   a payout in plain English; never show *how likely*. If a choice makes it read as a wager,
   it's the wrong choice — even though the math stays real underneath.
2. **Crypto is invisible.** Money is money. No addresses, balances-as-hex, chains, gas, or
   signatures front-and-center. The fan sees "your wallet" and "$", not `0xDd…F8D2` and USDC
   contract addresses. Surface only what a non-crypto person needs to act.
3. **One tap, in the stands.** Designed for a distracted fan on mobile deciding in seconds:
   minimal steps, one clear primary action per screen, big legible money, fast feedback. Every
   extra field or ambiguous number is a dropped conversion.
4. **Warm, not corporate.** Speak like someone who's got your back. Reassurance over
   disclaimers, plain language over jargon, and a human moment at the payout — without tipping
   into sportsbook hype.
5. **Honest mechanism, opaque math.** Be transparent about the deal (premium, what's covered,
   that a real payout is funded) while keeping probability hidden from the fan. The desk's
   numbers stay truthful so the pool stays solvent; the fan's view stays simple.

## Accessibility & Inclusion

Working target: **WCAG 2.2 AA** (assumed default — not explicitly specified; revisit if a
stricter bar is needed). In practice: body text ≥4.5:1 and large text ≥3:1 contrast, fully
keyboard-operable with visible focus, and a `prefers-reduced-motion` alternative for every
animation. Inclusion here is also **cognitive**: plain-language, jargon-free copy is a
first-class accessibility concern given non-crypto-native, time-pressured users. Money amounts
must never rely on color alone to convey meaning.
