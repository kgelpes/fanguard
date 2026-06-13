import type { FixtureResolution } from "@fanguard/polymarket";

/** Content script → background: resolve a detected fixture to its blowout combos. */
export interface ResolveFixtureRequest {
  type: "RESOLVE_FIXTURE";
  query: string;
}

export type ResolveFixtureResponse =
  | { ok: true; data: FixtureResolution }
  | { ok: false; error: string; code?: string };

export type FanguardMessage = ResolveFixtureRequest;
