// Server-only: issues the ENS certificate-of-cover via NameStone's gasless
// offchain-subname API. NameStone runs the CCIP-Read resolver for the parent
// domain, so a `set-name` POST makes `policy-<id>.<parent>` resolve on mainnet
// (or Sepolia) immediately — no gas, no tx for the fan. The cover terms live in
// ENS text records, turning each policy into a portable, publicly verifiable
// credential. See https://namestone.com/docs/set-name.
import "server-only";

import { env } from "~/env";
import { coverSubLabel, ensParentDomain, ensProfileUrl } from "./config";

const NAMESTONE_SET_NAME_URL = "https://namestone.com/api/public_v1/set-name";

export interface CoverCertificateInput {
  policyId: string;
  /** Policyholder — the certificate name resolves to this address. */
  buyer: `0x${string}`;
  matchup: string;
  team: string;
  threshold: number;
  payoutUsd: number;
  premiumUsd: number;
  gameId: string;
  /** On-chain buyPolicy tx (proof the certificate is backed by a real policy). */
  txHash: `0x${string}`;
}

export interface CoverCertificate {
  /** Resolvable name, e.g. `policy-42.fanguard.eth`. */
  name: string;
  /** Public ENS profile link where the records resolve. */
  url: string;
}

/** True once both halves are configured — the API key and a parent domain. */
export function isCertificateConfigured(): boolean {
  return Boolean(env.NAMESTONE_API_KEY) && ensParentDomain() !== null;
}

function usd(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * Issues (or updates) the per-policy certificate subname + text records.
 * Idempotent on the label: re-issuing the same policy overwrites its records,
 * which is exactly what a status change ("active" → "paid") needs later.
 */
export async function issueCoverCertificate(
  input: CoverCertificateInput,
): Promise<CoverCertificate> {
  const apiKey = env.NAMESTONE_API_KEY;
  const domain = ensParentDomain();
  if (!apiKey || !domain) {
    throw new Error(
      "ENS certificate not configured: set NAMESTONE_API_KEY and NEXT_PUBLIC_ENS_PARENT_DOMAIN.",
    );
  }

  const label = coverSubLabel(input.policyId);
  const name = `${label}.${domain}`;
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "https://fanguard.app";

  // Standard keys (description/url/avatar) render in any ENS app; the `fanguard.*`
  // namespace carries the machine-readable, verifiable cover terms.
  const textRecords: Record<string, string> = {
    description: `FanGuard cover · ${input.matchup} — pays ${usd(input.payoutUsd)} if ${input.team} loses by ${input.threshold}+. Premium ${usd(input.premiumUsd)}.`,
    url: `${appUrl}/desk`,
    avatar: `${appUrl}/fanguard-shield.png`,
    "fanguard.matchup": input.matchup,
    "fanguard.team": input.team,
    "fanguard.threshold": String(input.threshold),
    "fanguard.payout-usd": input.payoutUsd.toFixed(2),
    "fanguard.premium-usd": input.premiumUsd.toFixed(2),
    "fanguard.policy-id": input.policyId,
    "fanguard.game-id": input.gameId,
    "fanguard.tx": input.txHash,
    "fanguard.network": "polygon",
    "fanguard.status": "active",
  };

  const res = await fetch(NAMESTONE_SET_NAME_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({
      domain,
      name: label,
      address: input.buyer,
      text_records: textRecords,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`NameStone set-name failed (${res.status}): ${detail || res.statusText}`);
  }

  return { name, url: ensProfileUrl(name) };
}
