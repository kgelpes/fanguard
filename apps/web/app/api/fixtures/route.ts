import { NextResponse } from "next/server";

import {
  EventNotFoundError,
  FixtureParseError,
  GammaApiError,
  NoSpreadMarketsError,
  resolveFixture,
} from "@fanguard/polymarket";

/**
 * GET /api/fixtures?q=Brazil%20vs%20Morocco[&shutout=1]
 *
 * Resolves a fixture or pasted ticket title to its Polymarket event, spread
 * markets, and per-team blowout combos.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? searchParams.get("fixture");
  const includeShutoutLeg = ["1", "true", "yes"].includes(
    (searchParams.get("shutout") ?? "").toLowerCase(),
  );

  if (!query?.trim()) {
    return NextResponse.json(
      { error: "Missing required query parameter `q`.", code: "MISSING_QUERY" },
      { status: 400 },
    );
  }

  try {
    const resolution = await resolveFixture(query, { includeShutoutLeg });
    return NextResponse.json(resolution, {
      headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    if (error instanceof FixtureParseError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    if (error instanceof EventNotFoundError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 404 });
    }
    if (error instanceof NoSpreadMarketsError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }
    if (error instanceof GammaApiError) {
      return NextResponse.json(
        { error: "Upstream Polymarket request failed.", code: "GAMMA_ERROR" },
        { status: 502 },
      );
    }
    console.error("[/api/fixtures] unexpected error", error);
    return NextResponse.json(
      { error: "Unexpected error resolving fixture.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
