import type { BlowoutCombo } from "@fanguard/polymarket";

// Pass-through pricing: we read the market's blowout probability and mark it up
// modestly. The probability itself is hidden from the fan (loss-framed UI); the
// math stays real so the payout stays funded. See CONTEXT.md "Pricing model".
export const MARKUP = 1.15;
export const MIN_PREMIUM = 5;
export const FALLBACK_PAYOUT = 250;
export const MAX_P_BLOWOUT = 0.95;

export interface QuoteInput {
  /** Per-team blowout combos from a resolved fixture. */
  combos: BlowoutCombo[];
  /** The team the fan came for — their night is ruined if this team gets blown out. */
  myTeam: string;
  /** Ticket price in USD; the cover targets a full-ticket payout. Falls back to FALLBACK_PAYOUT. */
  ticketPriceUsd?: number | null;
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

/**
 * Price a blowout cover for a fan of `myTeam`. The trigger is `myTeam` getting
 * blown out, i.e. the opponent's "win big" combo. Premium passes through the
 * market probability: `premium = max(MIN_PREMIUM, pBlowout * payout * MARKUP)`.
 */
export function quoteCover({ combos, myTeam, ticketPriceUsd }: QuoteInput): CoverQuote {
  const payout = ticketPriceUsd ?? FALLBACK_PAYOUT;
  const triggerCombo = combos.find((c) => c.opponent === myTeam) ?? null;
  if (!triggerCombo) {
    return { premium: 0, payout, pBlowout: 0, triggerCombo: null };
  }
  const pBlowout = Math.min(MAX_P_BLOWOUT, triggerCombo.blowoutProbability);
  const premium = Math.max(MIN_PREMIUM, pBlowout * payout * MARKUP);
  return { premium, payout, pBlowout, triggerCombo };
}
