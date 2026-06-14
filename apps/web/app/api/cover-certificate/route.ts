import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";

import { isCertificateConfigured, issueCoverCertificate } from "~/lib/ens/certificate";

// Talks to NameStone over HTTPS — Node runtime, never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "dub1";

/**
 * POST /api/cover-certificate — mints the ENS certificate-of-cover.
 *
 * Called from the client right after `buyPolicy` confirms, with the real
 * minted policyId + cover terms. The NameStone key stays server-side, and the
 * subname is issued gaslessly, so the fan never signs or pays for it. Best
 * effort by design: if this fails the cover is still secured on-chain.
 */
export async function POST(request: Request) {
  if (!isCertificateConfigured()) {
    return NextResponse.json(
      {
        error:
          "ENS certificate not configured. Set NAMESTONE_API_KEY and NEXT_PUBLIC_ENS_PARENT_DOMAIN.",
        code: "ENS_NOT_CONFIGURED",
      },
      { status: 501 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON body.");
  }

  const policyId = asString(body.policyId);
  const buyerRaw = asString(body.buyer);
  const matchup = asString(body.matchup);
  const team = asString(body.team);
  const gameId = asString(body.gameId);
  const txHash = asString(body.txHash);
  const threshold = asNumber(body.threshold);
  const payoutUsd = asNumber(body.payoutUsd);
  const premiumUsd = asNumber(body.premiumUsd);

  if (!policyId) return bad("`policyId` is required.");
  if (!isAddress(buyerRaw)) return bad("`buyer` must be a valid EVM address.");
  if (!matchup || !team) return bad("`matchup` and `team` are required.");
  if (threshold == null || threshold <= 0) return bad("`threshold` must be positive.");
  if (payoutUsd == null || payoutUsd <= 0) return bad("`payoutUsd` must be positive.");
  if (premiumUsd == null || premiumUsd <= 0) return bad("`premiumUsd` must be positive.");

  try {
    const certificate = await issueCoverCertificate({
      policyId,
      buyer: getAddress(buyerRaw),
      matchup,
      team,
      threshold: Math.floor(threshold),
      payoutUsd,
      premiumUsd,
      gameId: gameId || "0",
      txHash: (txHash || "0x") as `0x${string}`,
    });
    return NextResponse.json(certificate, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to issue the certificate.";
    console.error("[/api/cover-certificate] error", error);
    return NextResponse.json({ error: message, code: "ENS_CERTIFICATE_ERROR" }, { status: 502 });
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function bad(message: string) {
  return NextResponse.json({ error: message, code: "BAD_REQUEST" }, { status: 400 });
}
