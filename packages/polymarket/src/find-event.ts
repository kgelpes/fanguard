import { EventNotFoundError } from "./errors";
import type { GammaClient, GammaEvent } from "./gamma";
import { normalizeName, teamMatchesTitle, type ParsedFixture } from "./fixture";

/**
 * A sports game on Polymarket is spread across sibling events that share a slug
 * prefix ending in the game date, e.g.
 *   `mls-sea-rsl-2026-04-12`               → main event (moneyline)
 *   `mls-sea-rsl-2026-04-12-more-markets`  → spreads + totals + BTTS
 *   `mls-sea-rsl-2026-04-12-halftime-result`, `-exact-score`, ...
 *
 * We derive the base slug (up to and including the date) so we can fetch the
 * `-more-markets` sibling regardless of which sibling search returned.
 */
const BASE_SLUG_RE = /^(.*\d{4}-\d{2}-\d{2})(?:-.+)?$/;

export function deriveBaseSlug(slug: string): string {
  const match = slug.match(BASE_SLUG_RE);
  if (match?.[1]) return match[1];
  // No date in slug — strip a known sibling suffix if present.
  return slug.replace(/-more-markets$/, "");
}

export function moreMarketsSlug(slug: string): string {
  return `${deriveBaseSlug(slug)}-more-markets`;
}

/** Title looks like a head-to-head game ("X vs. Y"), not a futures/novelty market. */
function looksLikeGame(title: string): boolean {
  return /\bvs\.?\b/i.test(title) || /\bv\.?\b/i.test(title);
}

export interface EventMatch {
  event: GammaEvent;
  /** Both teams matched the title and it looks like a real game. */
  confident: boolean;
}

/**
 * Find the Gamma event for a fixture.
 *
 * Gamma's `title_search` is near-literal, so a single combined query
 * ("Brazil Morocco") frequently misses. Instead we query by each team name
 * independently, union the candidates, and rank client-side by how well both
 * teams match the event title.
 */
export async function findFixtureEvent(
  client: GammaClient,
  fixture: ParsedFixture,
): Promise<EventMatch> {
  const queries = unique([
    `${fixture.canonicalA} ${fixture.canonicalB}`,
    fixture.canonicalA,
    fixture.canonicalB,
    fixture.teamA,
    fixture.teamB,
  ]);

  const candidates = new Map<string, GammaEvent>();
  for (const query of queries) {
    if (candidates.size > 0 && queries.indexOf(query) >= 3) break; // enough signal already
    const events = await client.searchEventsByTitle(query, { limit: 20 });
    for (const event of events) {
      // Collapse all siblings onto their base slug so duplicates merge and we
      // prefer the canonical main event.
      const baseSlug = deriveBaseSlug(event.slug);
      const existing = candidates.get(baseSlug);
      if (!existing || isMainEvent(event, baseSlug)) {
        candidates.set(baseSlug, event);
      }
    }
  }

  const scored = [...candidates.values()]
    .map((event) => scoreCandidate(event, fixture))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || startDateRank(a.event) - startDateRank(b.event));

  const best = scored[0];
  if (!best) {
    throw new EventNotFoundError(
      `No Polymarket event found for "${fixture.teamA}" vs "${fixture.teamB}".`,
      { teamA: fixture.teamA, teamB: fixture.teamB },
    );
  }

  return { event: best.event, confident: best.bothTeams && best.isGame };
}

interface ScoredCandidate {
  event: GammaEvent;
  score: number;
  bothTeams: boolean;
  isGame: boolean;
}

function scoreCandidate(event: GammaEvent, fixture: ParsedFixture): ScoredCandidate {
  const normalizedTitle = normalizeName(event.title);
  const matchesA =
    teamMatchesTitle(fixture.canonicalA, normalizedTitle) ||
    teamMatchesTitle(fixture.teamA, normalizedTitle);
  const matchesB =
    teamMatchesTitle(fixture.canonicalB, normalizedTitle) ||
    teamMatchesTitle(fixture.teamB, normalizedTitle);
  const isGame = looksLikeGame(event.title);

  let score = 0;
  if (matchesA) score += 1;
  if (matchesB) score += 1;
  if (matchesA && matchesB) score += 3; // both teams present is the strong signal
  if (isGame) score += 2;
  // Real games carry a numeric sports.gameId; futures/novelty don't.
  if (event.sports?.gameId != null) score += 1;

  return { event, score, bothTeams: matchesA && matchesB, isGame };
}

function isMainEvent(event: GammaEvent, baseSlug: string): boolean {
  return event.slug === baseSlug;
}

/** Sort soonest-upcoming first; events without a date sink to the bottom. */
function startDateRank(event: GammaEvent): number {
  if (!event.startDate) return Number.MAX_SAFE_INTEGER;
  const time = Date.parse(event.startDate);
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}
