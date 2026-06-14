// ENS certificate-of-cover wiring. Each policy gets a resolvable subname
// (e.g. `policy-42.fanguard.eth`) whose text records hold the cover terms —
// minted gaslessly via NameStone's offchain resolver right after `buyPolicy`.
// Client-safe: nothing secret here (the NameStone key lives only in the route).
import { env } from "~/env";

/** Parent ENS name policies hang off of (e.g. "fanguard.eth"), or null. */
export function ensParentDomain(): string | null {
  const raw = env.NEXT_PUBLIC_ENS_PARENT_DOMAIN?.trim().toLowerCase();
  return raw ? raw : null;
}

/** True once a parent domain is set — gates the ENS certificate step. */
export function isEnsConfigured(): boolean {
  return ensParentDomain() !== null;
}

/** Which network the parent name resolves on (only used for profile links). */
export function ensNetwork(): "mainnet" | "sepolia" {
  return env.NEXT_PUBLIC_ENS_NETWORK === "sepolia" ? "sepolia" : "mainnet";
}

/** Stable subname label for a policy id — `policy-<id>`. */
export function coverSubLabel(policyId: string | number | bigint): string {
  return `policy-${policyId}`;
}

/** Full resolvable name for a policy, e.g. `policy-42.fanguard.eth`, or null. */
export function coverEnsName(policyId: string | number | bigint): string | null {
  const parent = ensParentDomain();
  return parent ? `${coverSubLabel(policyId)}.${parent}` : null;
}

/** Public ENS profile link where the certificate + its records resolve. */
export function ensProfileUrl(name: string): string {
  const host = ensNetwork() === "sepolia" ? "sepolia.app.ens.domains" : "app.ens.domains";
  return `https://${host}/${name}`;
}
