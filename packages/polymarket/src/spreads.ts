import type { GammaEvent, GammaMarket } from "./gamma";
import { normalizeName } from "./fixture";
import type { BlowoutCombo, ComboLeg, SpreadLeg } from "./types";

const PROBABILITY_EPSILON = 1e-6;

function toProbability(value: string | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // Clamp into a usable open interval so `1 / p` stays finite.
  return Math.min(1, Math.max(PROBABILITY_EPSILON, n));
}

function isSpreadMarket(market: GammaMarket): boolean {
  return /-spread-/.test(market.slug) || /^spread:/i.test(market.question.trim());
}

function isBttsMarket(market: GammaMarket): boolean {
  return /-btts$/.test(market.slug) || /both teams to score/i.test(market.question);
}

/**
 * Normalize a Gamma spread market into a {@link SpreadLeg}.
 *
 * Gamma encodes spreads as: outcomes `[favoredTeam, otherTeam]`,
 * outcomePrices `[pCover, pNotCover]`, and a negative `line` (e.g. -2.5).
 * The favored team covers when it wins by MORE than `|line|` goals.
 */
export function parseSpreadLeg(market: GammaMarket): SpreadLeg | null {
  const team = market.outcomes[0];
  const opponent = market.outcomes[1];
  const coverProbability = toProbability(market.outcomePrices[0]);
  if (!team || !opponent || coverProbability == null) return null;

  const line = market.line != null ? Math.abs(market.line) : NaN;
  if (!Number.isFinite(line)) return null;

  return {
    marketSlug: market.slug,
    question: market.question,
    team,
    opponent,
    line,
    coverProbability,
    decimalOdds: 1 / coverProbability,
    coverTokenId: market.clobTokenIds[0] ?? null,
  };
}

/** Extract and sort every spread leg from a `-more-markets` event. */
export function extractSpreads(event: GammaEvent): SpreadLeg[] {
  return event.markets
    .filter(isSpreadMarket)
    .map(parseSpreadLeg)
    .filter((leg): leg is SpreadLeg => leg !== null)
    .sort((a, b) => a.team.localeCompare(b.team) || a.line - b.line);
}

function spreadAsComboLeg(leg: SpreadLeg): ComboLeg {
  return {
    marketSlug: leg.marketSlug,
    question: leg.question,
    selection: `${leg.team} wins by more than ${leg.line}`,
    probability: leg.coverProbability,
    decimalOdds: leg.decimalOdds,
    tokenId: leg.coverTokenId,
  };
}

/** Build the "opponent fails to score" proxy leg from a BTTS market, if present. */
function shutoutLeg(event: GammaEvent): ComboLeg | null {
  const market = event.markets.find(isBttsMarket);
  if (!market) return null;
  // BTTS outcomes are ["Yes", "No"]; "No" ≈ at least one team kept a clean sheet,
  // a reasonable "no consolation goal" proxy for a heavy favorite.
  const probability = toProbability(market.outcomePrices[1]);
  if (probability == null) return null;
  return {
    marketSlug: market.slug,
    question: market.question,
    selection: "Both Teams to Score: No",
    probability,
    decimalOdds: 1 / probability,
    tokenId: market.clobTokenIds[1] ?? null,
  };
}

export interface BuildCombosOptions {
  /**
   * Stack the BTTS "No" leg onto each combo to approximate a "blown out AND no
   * consolation" trigger. Adds an independence approximation. Default `false`.
   */
  includeShutoutLeg?: boolean;
}

/**
 * Build one blowout combo per team. The primary leg is the team's DEEPEST
 * available spread (largest margin) — the rarest, most unambiguous blowout
 * threshold the market offers.
 */
export function buildBlowoutCombos(
  event: GammaEvent,
  spreads: SpreadLeg[],
  options: BuildCombosOptions = {},
): BlowoutCombo[] {
  const deepestByTeam = new Map<string, SpreadLeg>();
  for (const leg of spreads) {
    const key = normalizeName(leg.team);
    const current = deepestByTeam.get(key);
    if (!current || leg.line > current.line) {
      deepestByTeam.set(key, leg);
    }
  }

  const shutout = options.includeShutoutLeg ? shutoutLeg(event) : null;

  return [...deepestByTeam.values()]
    .sort((a, b) => a.team.localeCompare(b.team))
    .map((spread) => {
      const legs: ComboLeg[] = [spreadAsComboLeg(spread)];
      if (shutout) legs.push(shutout);

      const blowoutProbability = legs.reduce((product, leg) => product * leg.probability, 1);
      return {
        team: spread.team,
        opponent: spread.opponent,
        legs,
        blowoutProbability,
        comboMultiplier: 1 / blowoutProbability,
        independenceApprox: legs.length > 1,
      };
    });
}
