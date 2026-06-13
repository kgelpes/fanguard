import { NoSpreadMarketsError } from "./errors";
import { findFixtureEvent, moreMarketsSlug } from "./find-event";
import { GammaClient, type GammaClientOptions } from "./gamma";
import { parseFixture } from "./fixture";
import { buildBlowoutCombos, extractSpreads, type BuildCombosOptions } from "./spreads";
import type { FixtureResolution } from "./types";

export interface ResolveFixtureOptions extends BuildCombosOptions {
  /** Provide a preconfigured client, or pass options to build one. */
  client?: GammaClient;
  gamma?: GammaClientOptions;
}

/**
 * Resolve a fixture string ("Brazil vs Morocco" or a pasted ticket title) to
 * its Polymarket event, spread markets, and a per-team blowout combo.
 *
 * Throws {@link FixtureParseError}, {@link EventNotFoundError}, or
 * {@link NoSpreadMarketsError} on the respective failure modes.
 */
export async function resolveFixture(
  input: string,
  options: ResolveFixtureOptions = {},
): Promise<FixtureResolution> {
  const client = options.client ?? new GammaClient(options.gamma);

  const fixture = parseFixture(input);
  const { event, confident } = await findFixtureEvent(client, fixture);

  // Spreads live in the `-more-markets` sibling, never the main event.
  const siblingSlug = moreMarketsSlug(event.slug);
  const moreMarkets = (await client.getEventBySlug(siblingSlug)) ?? event;
  const spreads = extractSpreads(moreMarkets);

  if (spreads.length === 0) {
    throw new NoSpreadMarketsError(
      `Found event "${event.title}" but it has no spread markets to build a blowout combo.`,
      event.slug,
    );
  }

  const combos = buildBlowoutCombos(moreMarkets, spreads, {
    includeShutoutLeg: options.includeShutoutLeg,
  });

  return {
    query: { raw: fixture.raw, teamA: fixture.teamA, teamB: fixture.teamB },
    event: {
      slug: event.slug,
      title: event.title,
      startDate: event.startDate ?? null,
      gameId: event.sports?.gameId ?? null,
      confident,
    },
    moreMarketsSlug: moreMarkets.slug,
    spreads,
    combos,
  };
}

export { GammaClient, GammaApiError } from "./gamma";
export { parseFixture, canonicalTeamName, normalizeName } from "./fixture";
export { findFixtureEvent, deriveBaseSlug, moreMarketsSlug } from "./find-event";
export { extractSpreads, buildBlowoutCombos } from "./spreads";
export { FixtureParseError, EventNotFoundError, NoSpreadMarketsError } from "./errors";
export type { ParsedFixture } from "./fixture";
export type { GammaClientOptions, GammaEvent, GammaMarket } from "./gamma";
export type { BuildCombosOptions } from "./spreads";
export type { SpreadLeg, ComboLeg, BlowoutCombo, FixtureResolution } from "./types";
