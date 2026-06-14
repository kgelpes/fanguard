import type { BlowoutCombo, ComboLeg } from "@fanguard/polymarket";

// Pass-through pricing: we read the market's blowout probability and mark it up
// modestly. The probability itself is hidden from the fan (loss-framed UI); the
// math stays real so the payout stays funded. See CONTEXT.md "Pricing model".
export const MARKUP = 1.15;
export const MIN_PREMIUM = 5;
export const FALLBACK_PAYOUT = 250;
export const MAX_P_BLOWOUT = 0.95;

/**
 * Affordability guardrail: if the bare single-spread cover would cost MORE than
 * this fraction of the ticket, we stack the opponent-shutout leg onto the
 * trigger to push the probability — and the premium — back down. A heavy
 * favorite makes the spread alone cheap to trigger (and pricey to insure);
 * requiring a clean sheet too makes it a rarer, more affordable cover.
 */
export const AUTO_SHUTOUT_PREMIUM_RATIO = 0.15;

/**
 * Polymarket's minimum order: a marketable buy must clear `size × price ≥ $1`.
 * Mirrors `MIN_ORDER_USD` in the web hedge service.
 */
export const POLYMARKET_MIN_ORDER_USD = 1;

/**
 * The smallest premium that's ALWAYS enough to fund the minimum hedge order
 * after the payment flows to the desk. A YES share costs up to ~$1 and the order
 * needs an integer share count with `size × price ≥ $1`, so the worst-case
 * reserve approaches $2 as the share price nears $1 (e.g. 2 shares × $0.99 =
 * $1.98). Rounding up to $2 guarantees the order is placeable at any price.
 */
export const POLYMARKET_MIN_FUNDING_USD = 2 * POLYMARKET_MIN_ORDER_USD;

export interface QuoteInput {
  /** Per-team blowout combos from a resolved fixture. */
  combos: BlowoutCombo[];
  /** The team the fan came for — their night is ruined if this team gets blown out. */
  myTeam: string;
  /** Ticket price in USD; the cover targets a full-ticket payout. Falls back to FALLBACK_PAYOUT. */
  ticketPriceUsd?: number | null;
  /**
   * Optional opponent-shutout leg (from the fixture resolution). Auto-stacked
   * onto the trigger combo when the bare spread cover would exceed
   * {@link AUTO_SHUTOUT_PREMIUM_RATIO} of the ticket — see {@link quoteCover}.
   */
  shutoutLeg?: ComboLeg | null;
}

export interface CoverQuote {
  /** What the fan pays, in USD. */
  premium: number;
  /** Full-ticket payout target, in USD. */
  payout: number;
  /** Market-implied blowout probability (clamped). Drives pricing only — never shown. */
  pBlowout: number;
  /**
   * The combo whose `opponent` is `myTeam` — i.e. the OTHER team running away
   * with it, which is what ruins the fan's night. `null` if the game has no
   * blowout line covering `myTeam`.
   */
  triggerCombo: BlowoutCombo | null;
}

/** Premium for a combo at a given payout — the shared `max(floor, p·payout·markup)`. */
function premiumFor(combo: BlowoutCombo, payout: number): number {
  const pBlowout = Math.min(MAX_P_BLOWOUT, combo.blowoutProbability);
  return Math.max(MIN_PREMIUM, pBlowout * payout * MARKUP);
}

/** Stack an extra leg onto a combo, recomputing its joint probability (independence approx). */
function stackLeg(combo: BlowoutCombo, leg: ComboLeg): BlowoutCombo {
  const legs = [...combo.legs, leg];
  const blowoutProbability = legs.reduce((product, l) => product * l.probability, 1);
  return {
    ...combo,
    legs,
    blowoutProbability,
    comboMultiplier: 1 / blowoutProbability,
    independenceApprox: true,
  };
}

/**
 * Price a blowout cover for a fan of `myTeam`. The trigger is `myTeam` getting
 * blown out, i.e. the opponent's "win big" combo. Premium passes through the
 * market probability: `premium = max(MIN_PREMIUM, pBlowout * payout * MARKUP)`.
 *
 * When a `shutoutLeg` is supplied and the bare single-spread cover would cost
 * more than {@link AUTO_SHUTOUT_PREMIUM_RATIO} of the ticket, the leg is stacked
 * onto the trigger (the fan must be blown out AND held scoreless) — a rarer,
 * cheaper trigger that keeps the cover affordable. We keep it only when it
 * actually lowers the premium.
 */
export function quoteCover({ combos, myTeam, ticketPriceUsd, shutoutLeg }: QuoteInput): CoverQuote {
  const payout = ticketPriceUsd ?? FALLBACK_PAYOUT;
  const baseCombo = combos.find((c) => c.opponent === myTeam) ?? null;
  if (!baseCombo) {
    return { premium: 0, payout, pBlowout: 0, triggerCombo: null };
  }

  let triggerCombo = baseCombo;
  const alreadyStacked =
    shutoutLeg != null && baseCombo.legs.some((l) => l.marketSlug === shutoutLeg.marketSlug);
  if (shutoutLeg && !alreadyStacked) {
    const basePremium = premiumFor(baseCombo, payout);
    if (basePremium / payout > AUTO_SHUTOUT_PREMIUM_RATIO) {
      const stacked = stackLeg(baseCombo, shutoutLeg);
      if (premiumFor(stacked, payout) < basePremium) {
        triggerCombo = stacked;
      }
    }
  }

  const pBlowout = Math.min(MAX_P_BLOWOUT, triggerCombo.blowoutProbability);
  const premium = Math.max(MIN_PREMIUM, pBlowout * payout * MARKUP);
  return { premium, payout, pBlowout, triggerCombo };
}
