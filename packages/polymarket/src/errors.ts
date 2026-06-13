/**
 * Typed errors so consumers (e.g. an API route) can map failures to the right
 * HTTP status without string-matching.
 */

export class FixtureParseError extends Error {
  readonly code = "FIXTURE_PARSE_ERROR";
  constructor(
    message: string,
    readonly input: string,
  ) {
    super(message);
    this.name = "FixtureParseError";
  }
}

export class EventNotFoundError extends Error {
  readonly code = "EVENT_NOT_FOUND";
  constructor(
    message: string,
    readonly query: { teamA: string; teamB: string },
  ) {
    super(message);
    this.name = "EventNotFoundError";
  }
}

export class NoSpreadMarketsError extends Error {
  readonly code = "NO_SPREAD_MARKETS";
  constructor(
    message: string,
    readonly eventSlug: string,
  ) {
    super(message);
    this.name = "NoSpreadMarketsError";
  }
}
