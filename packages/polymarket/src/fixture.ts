import { FixtureParseError } from "./errors";

/**
 * Parses a free-form fixture string into its two teams.
 *
 * Accepts both bare fixtures ("Brazil vs Morocco") and pasted ticket titles
 * with trailing metadata ("Brazil vs Morocco - World Cup - Group C").
 */
export interface ParsedFixture {
  /** The original input, untouched. */
  raw: string;
  /** Team as the user wrote it (left of the separator). */
  teamA: string;
  /** Team as the user wrote it (right of the separator). */
  teamB: string;
  /** Canonical/alias-resolved name used to query Gamma. */
  canonicalA: string;
  canonicalB: string;
}

/**
 * Tokens that separate the two teams, tried in order. Longest/most specific
 * first so " vs. " wins over a bare " v ".
 */
const VS_SEPARATORS = [" vs. ", " vs ", " v. ", " v ", " vs.", " @ ", " versus "];

/**
 * Common short-hands fans type vs. the canonical names Gamma indexes. Gamma's
 * `title_search` is near-literal, so a small alias table meaningfully improves
 * hit rate. Keys are normalized (see {@link normalizeName}).
 */
const TEAM_ALIASES: Record<string, string> = {
  usa: "United States",
  us: "United States",
  uk: "United Kingdom",
  turkey: "Türkiye",
  "south korea": "Korea Republic",
  "north korea": "Korea DPR",
  "ivory coast": "Côte d'Ivoire",
  czechia: "Czech Republic",
};

/** Lowercase, strip diacritics and punctuation, collapse whitespace. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Resolve a user-typed team name through the alias table, if known. */
export function canonicalTeamName(name: string): string {
  const alias = TEAM_ALIASES[normalizeName(name)];
  return alias ?? name.trim();
}

/**
 * Strip trailing ticket metadata. Ticket titles append " - <comp> - <group>"
 * style segments; the fixture itself is the first segment that contains a
 * vs-separator (or, failing that, the whole string).
 */
function isolateFixtureSegment(input: string): string {
  const segments = input.split(/\s+[-–—|]\s+/);
  const withVs = segments.find((segment) =>
    VS_SEPARATORS.some((sep) => segment.toLowerCase().includes(sep.trim())),
  );
  return (withVs ?? segments[0] ?? input).trim();
}

function splitTeams(segment: string): [string, string] | null {
  const lower = segment.toLowerCase();
  for (const sep of VS_SEPARATORS) {
    const idx = lower.indexOf(sep);
    if (idx !== -1) {
      const teamA = segment.slice(0, idx).trim();
      const teamB = segment.slice(idx + sep.length).trim();
      if (teamA && teamB) return [teamA, teamB];
    }
  }
  return null;
}

export function parseFixture(input: string): ParsedFixture {
  const raw = input ?? "";
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new FixtureParseError("Empty fixture input", raw);
  }

  const segment = isolateFixtureSegment(trimmed);
  const teams = splitTeams(segment) ?? splitTeams(trimmed);
  if (!teams) {
    throw new FixtureParseError(
      `Could not find two teams in "${trimmed}". Expected something like "Brazil vs Morocco".`,
      raw,
    );
  }

  const [teamA, teamB] = teams;
  return {
    raw,
    teamA,
    teamB,
    canonicalA: canonicalTeamName(teamA),
    canonicalB: canonicalTeamName(teamB),
  };
}

/**
 * Significant tokens of a team name (length >= 3, dropping common filler like
 * "fc"/"sc"). Used to fuzzily match a team against a Gamma event title.
 */
const FILLER_TOKENS = new Set(["fc", "sc", "afc", "cf", "ac", "club", "the", "and", "de"]);

export function significantTokens(name: string): string[] {
  return normalizeName(name)
    .split(" ")
    .filter((token) => token.length >= 3 && !FILLER_TOKENS.has(token));
}

/**
 * True when `name`'s distinctive tokens appear in `haystack` (a normalized
 * event title). Returns true if at least one significant token matches, which
 * tolerates partial names ("Seattle" → "Seattle Sounders FC").
 */
export function teamMatchesTitle(name: string, normalizedTitle: string): boolean {
  const tokens = significantTokens(name);
  if (tokens.length === 0) {
    // Very short names (e.g. "PSG") fall back to a normalized substring test.
    return normalizedTitle.includes(normalizeName(name));
  }
  return tokens.some((token) => normalizedTitle.includes(token));
}
