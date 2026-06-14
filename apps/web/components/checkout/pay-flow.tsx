"use client";

import * as React from "react";
import Image from "next/image";
import { useAccount } from "wagmi";
import {
  Deposit,
  getDisplayMessage,
  type DepositError,
  type DepositStatus,
} from "@swype-org/deposit";
import { BlinkDepositButton } from "@swype-org/deposit/react";

import { POLYMARKET_MIN_FUNDING_USD } from "@fanguard/pricing";

import { Button } from "~/components/ui/button";
import { env } from "~/env";
import { isCoverPoolConfigured } from "~/lib/cover-pool/config";
import { useBuyPolicy, type BuyPolicyStatus } from "~/lib/cover-pool/use-buy-policy";
import { DEFAULT_PAYMENT_SOURCE, POLYGON_CHAIN_ID, POLYGON_USDC } from "~/lib/flow/config";
import { useFlowPayment, type FlowPaymentStatus } from "~/lib/flow/use-flow-payment";
import { useTestMode } from "~/lib/test-mode";
import { useUsdcBalance } from "~/lib/use-usdc-balance";

function usd(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const DEPOSIT_CHAIN_ID = Number(POLYGON_CHAIN_ID);

const PAY_PROGRESS: Partial<Record<FlowPaymentStatus, string>> = {
  starting: "Getting your payment ready…",
  awaiting_signature: "Confirm in your wallet…",
  broadcasting: "Sending your payment…",
  settling: "Finishing up…",
};

// CoverPool mode: after the premium settles, the fan's wallet mints the on-chain
// policy (approve → buyPolicy). Plain-language, crypto-offstage.
const MINT_PROGRESS: Partial<Record<BuyPolicyStatus, string>> = {
  signing: "Securing your cover…",
  approving: "Confirm in your wallet…",
  buying: "Locking in your policy…",
  certifying: "Issuing your cover certificate…",
};

/**
 * The receipt's money zone — one coherent flow that answers "what do I have, and
 * what's next". Shows the premium, the live wallet balance, asks the fan to add
 * money ONLY when they're short (Blink), then pays the premium (Dynamic Flow).
 * Dollars-only, jargon-free; crypto stays offstage. See DESIGN.md.
 */
export function PayFlow({
  premium,
  payout,
  team,
  matchup,
  onPaid,
}: {
  premium: number;
  /** Full-ticket payout the policy is minted for (CoverPool mode). */
  payout: number;
  team: string;
  matchup: string | null;
  /** Fires once when the cover is fully secured — the cue to run the hedge. */
  onPaid?: () => void;
}) {
  const { address, isConnected } = useAccount();
  const { testMode: isTest } = useTestMode();
  const { usd: balance, refetch: refetchBalance } = useUsdcBalance();

  // Demo mode charges the hedge minimum instead of the full premium.
  const charge = isTest ? POLYMARKET_MIN_FUNDING_USD : premium;
  const funded = balance != null && balance >= charge;

  // CoverPool mints an on-chain policy after the premium settles — but only when
  // the vault is configured AND we know the matchup (the gameId needs it).
  const canMint = isCoverPoolConfigured() && Boolean(matchup);

  // ── Pay (Dynamic Flow) ────────────────────────────────────────────────────
  const { status: payStatus, quote, error: payError, pay, reset: resetPay } = useFlowPayment();
  const { status: mintStatus, result: mintResult, error: mintError, mint } = useBuyPolicy();

  const paidRef = React.useRef(false);
  const mintStartedRef = React.useRef(false);

  // Mint the policy from the fan's wallet (CoverPool mode), charging exactly what
  // the fan settled (the demo charge in test mode) for a full-ticket payout.
  const runMint = React.useCallback(() => {
    if (!matchup) return;
    void mint({ matchup, team, payoutUsd: payout, premiumUsd: charge });
  }, [mint, matchup, team, payout, charge]);

  // Once the premium settles: in CoverPool mode kick off the mint; otherwise the
  // cover is secured and we fire onPaid directly (legacy path).
  React.useEffect(() => {
    if (payStatus === "idle") {
      paidRef.current = false;
      mintStartedRef.current = false;
      return;
    }
    if (payStatus !== "completed") return;
    if (canMint) {
      if (!mintStartedRef.current) {
        mintStartedRef.current = true;
        runMint();
      }
    } else if (!paidRef.current) {
      paidRef.current = true;
      onPaid?.();
    }
  }, [payStatus, canMint, runMint, onPaid]);

  // The on-chain policy minted — now the cover is truly secured.
  React.useEffect(() => {
    if (mintStatus === "done" && !paidRef.current) {
      paidRef.current = true;
      onPaid?.();
    }
  }, [mintStatus, onPaid]);

  const paying =
    payStatus === "starting" ||
    payStatus === "awaiting_signature" ||
    payStatus === "broadcasting" ||
    payStatus === "settling";
  const minting =
    mintStatus === "signing" ||
    mintStatus === "approving" ||
    mintStatus === "buying" ||
    mintStatus === "certifying";
  const busy = paying || minting;
  const covered = canMint ? mintStatus === "done" : payStatus === "completed";

  const handlePay = React.useCallback(() => {
    void pay(
      charge,
      DEFAULT_PAYMENT_SOURCE,
      {
        team,
        matchup: matchup ?? undefined,
        product: "blowout-cover",
        ...(isTest ? { test: true, displayedPremiumUsd: premium } : {}),
      },
      // In CoverPool mode, settle the premium to the fan's own wallet so buyPolicy
      // can pull it; otherwise settle to the desk (legacy).
      { settleToSource: canMint },
    );
  }, [pay, charge, team, matchup, isTest, premium, canMint]);

  // ── Add money (Blink) ─────────────────────────────────────────────────────
  // Construct inside the effect so React StrictMode's remount rebuilds it
  // cleanly (the SDK's own hook crashes on remount).
  const merchantId = env.NEXT_PUBLIC_BLINK_MERCHANT_ID;
  const addRef = React.useRef<Deposit | null>(null);
  const [addStatus, setAddStatus] = React.useState<DepositStatus>("idle");
  const [addError, setAddError] = React.useState<DepositError | null>(null);

  React.useEffect(() => {
    if (!merchantId) return;
    const deposit = new Deposit({
      signer: "/api/sign-payment",
      merchantId,
      environment: env.NEXT_PUBLIC_BLINK_ENV,
    });
    addRef.current = deposit;
    const onStatus = (s: DepositStatus) => setAddStatus(s);
    const onComplete = () => {
      setAddError(null);
      void refetchBalance();
    };
    const onError = (e: DepositError) => setAddError(e);
    deposit.on("status-change", onStatus);
    deposit.on("complete", onComplete);
    deposit.on("error", onError);
    return () => {
      deposit.off("status-change", onStatus);
      deposit.off("complete", onComplete);
      deposit.off("error", onError);
      deposit.destroy();
      addRef.current = null;
    };
  }, [merchantId, refetchBalance]);

  const adding = addStatus === "signer-loading" || addStatus === "iframe-active";

  const handleAdd = React.useCallback(async () => {
    const deposit = addRef.current;
    if (!address || !deposit) return;
    try {
      await deposit.requestDeposit({
        amount: charge,
        chainId: DEPOSIT_CHAIN_ID,
        address,
        token: POLYGON_USDC,
        metadata: { product: "blowout-cover", team, ...(matchup ? { matchup } : {}) },
      });
    } catch {
      /* surfaced via addError */
    }
  }, [address, charge, team, matchup]);

  // ── Covered ───────────────────────────────────────────────────────────────
  if (covered) {
    return (
      <div className="bg-card text-card-foreground flex flex-col items-center gap-3 rounded-xl border p-6 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
          <Image src="/fanguard-shield.png" alt="" width={36} height={36} priority />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-lg font-semibold">
            You’re covered{isTest ? " (demo)" : ""}
          </h3>
          <p className="text-muted-foreground text-sm text-balance">
            Your {usd(charge)} {isTest ? "demo payment" : "premium"} is paid. If {team} gets
            crushed, your payout’s waiting — before you leave the stadium.
          </p>
        </div>
        {mintResult?.ensName && mintResult.ensUrl && (
          <a
            href={mintResult.ensUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs font-medium"
          >
            <span aria-hidden>🛡️</span>
            {mintResult.ensName}
          </a>
        )}
        {mintResult?.txHash && (
          <a
            href={`https://polygonscan.com/tx/${mintResult.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground text-xs underline"
          >
            {mintResult.policyId ? `Policy #${mintResult.policyId}` : "Your cover"} · on-chain proof
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card text-card-foreground flex flex-col rounded-xl border p-5">
      {/* Premium — the price line of the receipt. */}
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Your premium</span>
        <span className="font-display text-2xl font-semibold tabular-nums">{usd(charge)}</span>
      </div>
      {isTest && (
        <p className="text-muted-foreground mt-1 text-xs">
          Demo — you’ll pay {usd(charge)}, not the full {usd(premium)}.
        </p>
      )}

      {/* Wallet — what you have to pay it with. */}
      <div className="mt-4 flex items-center justify-between border-t pt-4">
        <span className="text-muted-foreground text-sm">Your wallet</span>
        <span className="text-sm font-medium tabular-nums">
          {!isConnected ? "—" : balance == null ? "…" : usd(balance)}
        </span>
      </div>

      {!isConnected ? (
        <p className="text-muted-foreground mt-4 text-sm">Log in above to pay your premium.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {/* Add money — only when short. */}
          {!funded && (
            <div className="flex flex-col gap-2">
              <BlinkDepositButton
                onClick={handleAdd}
                loading={addStatus === "signer-loading"}
                disabled={adding}
              />
              <p className="text-muted-foreground text-xs">
                Your wallet’s short — top up at least {usd(charge)} from an exchange or any wallet,
                then pay below.
              </p>
              {addError && (
                <p className="text-destructive text-xs">{getDisplayMessage(addError)}</p>
              )}
            </div>
          )}

          {/* Pay — the primary action, ready once funded. */}
          <Button onClick={handlePay} disabled={busy || !funded} className="h-11 text-base">
            {busy
              ? minting
                ? (MINT_PROGRESS[mintStatus] ?? "Securing your cover…")
                : (PAY_PROGRESS[payStatus] ?? "Working…")
              : `Pay ${usd(charge)}`}
          </Button>

          {quote && paying && quote.fromAmount !== quote.toAmount && (
            <p className="text-muted-foreground text-xs">
              You pay {quote.fromAmount} (incl. fees) — {usd(charge)} goes to your cover.
            </p>
          )}

          {(payStatus === "error" || payStatus === "failed") && payError && (
            <div className="flex flex-col gap-2">
              <p className="text-destructive text-sm">{payError}</p>
              <Button variant="outline" onClick={resetPay} className="self-start">
                Try again
              </Button>
            </div>
          )}

          {/* Mint failed after the premium settled — let the fan retry just the
              on-chain step (their payment is safe in their wallet). */}
          {mintStatus === "error" && mintError && (
            <div className="flex flex-col gap-2">
              <p className="text-destructive text-sm">{mintError}</p>
              <Button variant="outline" onClick={runMint} className="self-start">
                Finish securing your cover
              </Button>
            </div>
          )}

          <p className="text-muted-foreground text-center text-xs">
            Paid securely from your wallet.
          </p>
        </div>
      )}
    </div>
  );
}
