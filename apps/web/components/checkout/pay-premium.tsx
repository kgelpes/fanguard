"use client";

import * as React from "react";
import { useAccount } from "wagmi";

import { POLYMARKET_MIN_FUNDING_USD } from "@fanguard/pricing";

import { Button } from "~/components/ui/button";
import {
  DEFAULT_PAYMENT_SOURCE_ID,
  PAYMENT_SOURCES,
  resolvePaymentSource,
} from "~/lib/flow/config";
import { useFlowPayment, type FlowPaymentStatus } from "~/lib/flow/use-flow-payment";
import { useTestMode } from "~/lib/test-mode";

function formatUsd(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const PROGRESS_COPY: Partial<Record<FlowPaymentStatus, string>> = {
  starting: "Building your payment…",
  awaiting_signature: "Confirm the payment in your wallet…",
  broadcasting: "Broadcasting to Polygon…",
  settling: "Settling your premium in USDC…",
};

/**
 * The real premium payment, powered by Dynamic's Fireblocks Flow. The fan pays
 * from their embedded wallet (Polygon USDC); Flow settles USDC to the treasury.
 * Loss-framed copy stays dollars-only — no probabilities.
 */
export function PayPremium({
  premium,
  team,
  matchup,
  onSettled,
}: {
  premium: number;
  team: string;
  matchup: string | null;
  /** Fires once when the premium has settled — the cue to take the hedge. */
  onSettled?: () => void;
}) {
  const { isConnected } = useAccount();
  const { status, quote, txHash, error, pay, reset } = useFlowPayment();

  // Hand off to the hedge desk exactly once, when settlement completes.
  const settledRef = React.useRef(false);
  React.useEffect(() => {
    if (status === "completed" && !settledRef.current) {
      settledRef.current = true;
      onSettled?.();
    }
    if (status === "idle") settledRef.current = false;
  }, [status, onSettled]);

  // What the fan pays WITH. Flow swaps/bridges it to the settlement USDC on
  // Polygon — "any token, any chain" in, one token out.
  const [sourceId, setSourceId] = React.useState(DEFAULT_PAYMENT_SOURCE_ID);
  const source = resolvePaymentSource(sourceId);

  // Global test mode: charge the smallest amount that still funds a live hedge
  // order, instead of the full premium. Toggled app-wide.
  const { testMode: isTest } = useTestMode();
  const chargeUsd = isTest ? POLYMARKET_MIN_FUNDING_USD : premium;

  const busy =
    status === "starting" ||
    status === "awaiting_signature" ||
    status === "broadcasting" ||
    status === "settling";

  async function handlePay() {
    await pay(chargeUsd, source, {
      team,
      matchup: matchup ?? undefined,
      product: "blowout-cover",
      paidWith: `${source.symbol}@${source.chainId}`,
      ...(isTest ? { test: true, displayedPremiumUsd: premium } : {}),
    });
  }

  if (!isConnected) {
    return (
      <div className="bg-card text-card-foreground rounded-xl border p-5">
        <p className="text-muted-foreground text-sm">
          Log in above to spin up your wallet, then pay your{" "}
          <span className="font-medium">{formatUsd(premium)}</span> premium.
        </p>
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div className="bg-card text-card-foreground flex flex-col gap-3 rounded-xl border p-5">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-emerald-600">
            ✓ You’re covered{isTest ? " (test)" : ""}
          </span>
          <p className="text-sm">
            Your {formatUsd(chargeUsd)} {isTest ? "test payment" : "premium"} settled in USDC. If{" "}
            {team} gets blown out, your payout is ready.
          </p>
        </div>
        {txHash && <TxLink hash={txHash} />}
      </div>
    );
  }

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-4 rounded-xl border p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Pay your premium</span>
        <span className="text-lg font-semibold tabular-nums">{formatUsd(premium)}</span>
      </div>

      {isTest && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          Test mode — charging {formatUsd(chargeUsd)} instead of the full premium until the
          Polymarket payout is wired up.
        </p>
      )}

      <label className="text-muted-foreground flex flex-col gap-1 text-xs">
        Pay with
        <select
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          disabled={busy}
          className="text-foreground bg-background rounded-md border px-3 py-2 text-sm"
        >
          {PAYMENT_SOURCES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <Button onClick={handlePay} disabled={busy} className="self-start">
        {busy
          ? (PROGRESS_COPY[status] ?? "Working…")
          : `Pay ${formatUsd(chargeUsd)} with ${source.symbol}${isTest ? " (test)" : ""}`}
      </Button>

      {quote && busy && quote.fromAmount !== quote.toAmount && (
        <p className="text-muted-foreground text-xs">
          You pay {quote.fromAmount} (incl. routing + fees) → {formatUsd(premium)} USDC settles to
          the pool.
        </p>
      )}

      {busy && status !== "awaiting_signature" && (
        <p className="text-muted-foreground text-xs">
          {status === "settling"
            ? "Dynamic Flow is routing your payment — this can take a moment."
            : "Hold tight…"}
        </p>
      )}

      {txHash && busy && <TxLink hash={txHash} />}

      <p className="text-muted-foreground text-xs">
        Settled in USDC on Polygon via Dynamic Flow — pay from any token you hold.
      </p>

      {(status === "error" || status === "failed") && error && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <p className="text-destructive text-sm">{error}</p>
          <Button variant="outline" onClick={reset} className="self-start">
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={`https://polygonscan.com/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-muted-foreground hover:text-foreground font-mono text-xs underline break-all"
    >
      {hash}
    </a>
  );
}
