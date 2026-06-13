/** A single spread market, normalized from Gamma's representation. */
export interface SpreadLeg {
  /** Market slug, e.g. `mls-sea-rsl-2026-04-12-spread-home-2pt5`. */
  marketSlug: string;
  /** Gamma question, e.g. `Spread: Seattle Sounders FC (-2.5)`. */
  question: string;
  /** Team that must win by more than `line` goals (the favored/cover side). */
  team: string;
  /** The other team in the market. */
  opponent: string;
  /** Margin threshold (always positive): `team` must win by MORE than this. */
  line: number;
  /** Implied probability (0–1) that `team` covers, i.e. wins by > `line`. */
  coverProbability: number;
  /** Decimal odds of the cover outcome (`1 / coverProbability`). */
  decimalOdds: number;
  /** CLOB token id for the cover (YES-for-team) outcome, when available. */
  coverTokenId: string | null;
}

/** A non-spread leg that can be stacked onto a combo (e.g. a clean-sheet proxy). */
export interface ComboLeg {
  marketSlug: string;
  question: string;
  /** Human label for what this leg requires, e.g. "Both Teams to Score: No". */
  selection: string;
  probability: number;
  decimalOdds: number;
  tokenId: string | null;
}

/**
 * A per-team "blowout" combo: the trigger that pays out when this team wins
 * convincingly. The primary leg is the deepest available spread for the team;
 * additional legs (e.g. opponent shut out) can be stacked to better match a
 * "ruined night" trigger.
 */
export interface BlowoutCombo {
  /** Team favored to win big (Gamma's canonical name). */
  team: string;
  opponent: string;
  /** Spread leg(s) + any stacked legs that make up the combo. */
  legs: ComboLeg[];
  /**
   * Joint implied probability of all legs hitting. With a single spread leg
   * this is exact; with stacked legs it is the product of leg probabilities —
   * an independence approximation (see {@link independenceApprox}).
   */
  blowoutProbability: number;
  /**
   * `1 / blowoutProbability`. Matches FanGuard's pricing convention
   * (`pBlowout = 1 / comboMultiplier`).
   */
  comboMultiplier: number;
  /** True when the combo has >1 leg and `blowoutProbability` is approximate. */
  independenceApprox: boolean;
}

/** Full result of resolving a fixture to its Polymarket markets and combos. */
export interface FixtureResolution {
  query: {
    raw: string;
    teamA: string;
    teamB: string;
  };
  event: {
    slug: string;
    title: string;
    startDate: string | null;
    gameId: number | null;
    /** True when both teams confidently matched the event title. */
    confident: boolean;
  };
  /** Slug of the `-more-markets` sibling the spreads were read from. */
  moreMarketsSlug: string;
  /** All spread legs found, sorted by team then ascending line. */
  spreads: SpreadLeg[];
  /** One blowout combo per team that has spread markets (usually two). */
  combos: BlowoutCombo[];
}
