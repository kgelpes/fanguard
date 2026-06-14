"use client";

import * as React from "react";
import { erc20Abi, parseEventLogs } from "viem";
import { useAccount, useConfig, useSwitchChain, useWriteContract } from "wagmi";
import { getPublicClient } from "wagmi/actions";

import { coverPoolAbi } from "./abi";
import { COVERPOOL_CHAIN_ID } from "./config";

/** Quote returned by /api/sign-policy (bigints as strings). */
interface PolicyQuote {
  coverPoolAddress: `0x${string}`;
  collateral: `0x${string}`;
  gameId: string;
  payout: string;
  premium: string;
  nonce: string;
  deadline: string;
  threshold: number;
  signature: `0x${string}`;
}

export type BuyPolicyStatus =
  | "idle"
  | "signing" // settler is opening the game + signing the quote
  | "approving" // fan approves the vault to pull the premium (USDC.e)
  | "buying" // fan submits buyPolicy
  | "certifying" // issuing the gasless ENS certificate-of-cover
  | "done"
  | "error";

export interface BuyPolicyResult {
  policyId: string | null;
  txHash: `0x${string}`;
  gameId: string;
  /** Resolvable ENS certificate name (e.g. `policy-42.fanguard.eth`), if issued. */
  ensName: string | null;
  /** Public ENS profile link where the cover terms resolve, if issued. */
  ensUrl: string | null;
}

interface MintInput {
  matchup: string;
  team: string;
  payoutUsd: number;
  premiumUsd: number;
  threshold?: number;
}

/**
 * Mints the on-chain CoverPool policy from the FAN's wallet: fetch the
 * settler-signed quote, approve the vault to pull the premium (USDC.e), then
 * call buyPolicy. The fan ends up the policy holder, so the blowout payout
 * lands directly in their wallet. Premium must already be settled as USDC.e in
 * the wallet (Flow handles that upstream).
 */
export function useBuyPolicy() {
  const { address } = useAccount();
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();

  const [status, setStatus] = React.useState<BuyPolicyStatus>("idle");
  const [result, setResult] = React.useState<BuyPolicyResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const reset = React.useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  const mint = React.useCallback(
    async (input: MintInput): Promise<BuyPolicyResult | null> => {
      if (!address) {
        setError("Log in to mint your cover.");
        setStatus("error");
        return null;
      }
      setError(null);
      setResult(null);

      try {
        // 1. Settler opens the game (if needed) and signs the quote.
        setStatus("signing");
        const res = await fetch("/api/sign-policy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buyer: address,
            matchup: input.matchup,
            team: input.team,
            payoutUsd: input.payoutUsd,
            premiumUsd: input.premiumUsd,
            ...(input.threshold ? { threshold: input.threshold } : {}),
          }),
        });
        const quote = (await res.json().catch(() => ({}))) as PolicyQuote & { error?: string };
        if (!res.ok) throw new Error(quote.error || `Could not sign the policy (${res.status}).`);

        const pool = quote.coverPoolAddress;
        const premium = BigInt(quote.premium);
        const publicClient = getPublicClient(config, { chainId: COVERPOOL_CHAIN_ID });

        // Sign on Polygon — the vault lives there.
        await switchChainAsync({ chainId: COVERPOOL_CHAIN_ID }).catch(() => {});

        // 2. Approve the vault to pull the premium (USDC.e).
        setStatus("approving");
        const approveHash = await writeContractAsync({
          address: quote.collateral,
          abi: erc20Abi,
          functionName: "approve",
          args: [pool, premium],
          chainId: COVERPOOL_CHAIN_ID,
        });
        await publicClient?.waitForTransactionReceipt({ hash: approveHash });

        // 3. Submit buyPolicy with the settler-signed quote.
        setStatus("buying");
        const buyHash = await writeContractAsync({
          address: pool,
          abi: coverPoolAbi,
          functionName: "buyPolicy",
          args: [
            BigInt(quote.gameId),
            BigInt(quote.payout),
            premium,
            BigInt(quote.deadline),
            BigInt(quote.nonce),
            quote.signature,
          ],
          chainId: COVERPOOL_CHAIN_ID,
        });
        const receipt = await publicClient?.waitForTransactionReceipt({ hash: buyHash });

        // Best-effort: pull the minted policyId from the PolicyBought event.
        let policyId: string | null = null;
        if (receipt) {
          const events = parseEventLogs({
            abi: coverPoolAbi,
            eventName: "PolicyBought",
            logs: receipt.logs,
          });
          const minted = events[0];
          if (minted && "policyId" in minted.args) {
            policyId = (minted.args.policyId as bigint).toString();
          }
        }

        // Best-effort: issue the gasless ENS certificate-of-cover. The settler
        // key stays server-side, so the fan never signs for it. Failures here
        // never block the cover — it's already secured on-chain above.
        let ensName: string | null = null;
        let ensUrl: string | null = null;
        if (policyId) {
          setStatus("certifying");
          try {
            const certRes = await fetch("/api/cover-certificate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                policyId,
                buyer: address,
                matchup: input.matchup,
                team: input.team,
                threshold: quote.threshold,
                payoutUsd: input.payoutUsd,
                premiumUsd: input.premiumUsd,
                gameId: quote.gameId,
                txHash: buyHash,
              }),
            });
            if (certRes.ok) {
              const cert = (await certRes.json().catch(() => ({}))) as {
                name?: string;
                url?: string;
              };
              ensName = cert.name ?? null;
              ensUrl = cert.url ?? null;
            }
          } catch {
            /* non-fatal — the cover stands without the certificate */
          }
        }

        const out: BuyPolicyResult = {
          policyId,
          txHash: buyHash,
          gameId: quote.gameId,
          ensName,
          ensUrl,
        };
        setResult(out);
        setStatus("done");
        return out;
      } catch (err) {
        setError(describe(err));
        setStatus("error");
        return null;
      }
    },
    [address, config, switchChainAsync, writeContractAsync],
  );

  return { status, result, error, mint, reset };
}

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/reject|denied|cancell?ed|user (refused|declined)/i.test(message)) {
    return "Signature cancelled.";
  }
  return message || "Could not mint the policy.";
}
