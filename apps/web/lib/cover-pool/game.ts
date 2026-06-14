// Pure helpers shared by the buy path (openGame + signed quote) and, later, the
// settler agent (resolve). gameId must be DETERMINISTIC from the matchup + insured
// team so every actor derives the same id without a registry. No wallet/server
// imports here — safe to reuse from the settler agent when it lands.
import { keccak256, toHex } from "viem";

/**
 * A CoverPool `gameId` encodes one insurable trigger: a fixture + the insured
 * team. Deterministic so openGame, buyPolicy, and resolve all agree.
 */
export function deriveGameId(matchup: string, team: string): bigint {
  const key = `${matchup.trim().toLowerCase()}|${team.trim().toLowerCase()}`;
  return BigInt(keccak256(toHex(key)));
}

/**
 * Default blowout threshold (goals/points the insured team lost by) when no
 * spread line is available. 3 is an unambiguous "your night was ruined" margin.
 */
export const DEFAULT_BLOWOUT_THRESHOLD = 3;

/**
 * Threshold from a spread line. A spread leg pays when the favored team wins by
 * MORE than `line` (e.g. 2.5 → wins by 3+), so the insured team loses by
 * `floor(line) + 1` or more. Falls back to {@link DEFAULT_BLOWOUT_THRESHOLD}.
 */
export function thresholdFromLine(line: number | null | undefined): number {
  if (line == null || !Number.isFinite(line) || line <= 0) return DEFAULT_BLOWOUT_THRESHOLD;
  return Math.floor(line) + 1;
}
