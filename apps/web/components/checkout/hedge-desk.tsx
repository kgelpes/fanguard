"use client";

import * as React from "react";

import { Button } from "~/components/ui/button";

/**
 * "Behind the button" view of the FanGuard hedge desk. The fan never sees this
 * in production — it's the operator/demo lens showing the offsetting Polymarket
 * order being placed live (deposit wallet, blowout combo, matched fill).
 */

interface HedgeStatus {
  depositWallet: string;
  buyingPower: string;
}

interface HedgeResult {
  event: { title: string; slug: string };
  legSelection: string;
  tokenId: string;
  depositWallet: string;
  bestAsk: number | null;
  limitPrice: number;
  shares: number;
  estCostUsd: number;
  orderId: string | null;
  status: string;
  success: boolean;
  txHashes: string[];
  funding: { wrapped: string; moved: string };
}

type Phase = "idle" | "loading" | "placing" | "done" | "error";

function short(value: string, lead = 6, tail = 4): string {
  return value.length > lead + tail ? `${value.slice(0, lead)}…${value.slice(-tail)}` : value;
}

async function postHedge<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/hedge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Hedge request failed (${res.status}).`);
  return data;
}

export function HedgeDesk({
  team,
  matchup,
  shutout,
  trigger = 0,
}: {
  team: string;
  matchup: string | null;
  shutout?: boolean;
  /** Increment to auto-run the hedge (e.g. once the premium settles). */
  trigger?: number;
}) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [status, setStatus] = React.useState<HedgeStatus | null>(null);
  const [result, setResult] = React.useState<HedgeResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadStatus = React.useCallback(async () => {
    try {
      setStatus(await postHedge<HedgeStatus>({ action: "status" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the hedge desk.");
      setPhase("error");
    }
  }, []);

  React.useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const takeHedge = React.useCallback(async () => {
    if (!matchup) return;
    setError(null);
    setResult(null);
    setPhase("placing");
    try {
      const res = await postHedge<HedgeResult>({ action: "place", matchup, team, shutout });
      setResult(res);
      setPhase("done");
      void loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hedge failed.");
      setPhase("error");
    }
  }, [matchup, team, shutout, loadStatus]);

  // Auto-run when the premium settles (trigger increments).
  React.useEffect(() => {
    if (trigger > 0) void takeHedge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const placing = phase === "placing";

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-4 rounded-xl border border-dashed p-5">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">
            Behind the button · hedge desk
          </span>
          <span className="text-sm font-medium">The offsetting position on Polymarket</span>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600">
          live
        </span>
      </div>

      <div className="flex items-center justify-between border-t pt-3 text-sm">
        <span className="text-muted-foreground">Desk buying power</span>
        <span className="tabular-nums font-medium">
          {status ? `${status.buyingPower} pUSD` : "…"}
        </span>
      </div>
      {status && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Deposit wallet</span>
          <a
            href={`https://polygonscan.com/address/${status.depositWallet}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground font-mono underline"
          >
            {short(status.depositWallet)}
          </a>
        </div>
      )}

      <Button onClick={takeHedge} disabled={placing || !matchup} className="self-start">
        {placing ? "Placing the hedge on Polymarket…" : "Take the hedge"}
      </Button>

      {placing && (
        <ol className="text-muted-foreground flex flex-col gap-1 text-xs">
          <li>① Converting the settled premium → pUSD → deposit wallet…</li>
          <li>② Resolving the blowout combo for {team}…</li>
          <li>③ Signing the order from the deposit wallet (POLY_1271)…</li>
          <li>④ Posting to the Polymarket CLOB…</li>
        </ol>
      )}

      {phase === "done" && result && (
        <div className="flex flex-col gap-2 border-t pt-3 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-emerald-600">
            ✓ Hedge {result.status}
          </span>
          <p>
            Bought <span className="font-medium tabular-nums">{result.shares}</span> shares of{" "}
            <span className="font-medium">“{result.legSelection}”</span> @{" "}
            <span className="tabular-nums">{result.limitPrice}</span> (~$
            <span className="tabular-nums">{result.estCostUsd.toFixed(2)}</span>).
          </p>
          <p className="text-muted-foreground text-xs">
            {result.event.title} · this position pays out if {team} gets blown out, funding the
            fan’s cover.
          </p>
          {Number(result.funding.moved) > 0 && (
            <p className="text-muted-foreground text-xs">
              Auto-handled: converted {result.funding.wrapped} USDC.e → pUSD and moved{" "}
              {result.funding.moved} into the desk before ordering.
            </p>
          )}
          {result.orderId && (
            <span className="text-muted-foreground font-mono text-xs">
              order {short(result.orderId, 8, 6)}
            </span>
          )}
          {result.txHashes.map((h) => (
            <a
              key={h}
              href={`https://polygonscan.com/tx/${h}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground font-mono text-xs underline break-all"
            >
              {short(h, 10, 8)}
            </a>
          ))}
        </div>
      )}

      {phase === "error" && error && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <p className="text-destructive text-sm">{error}</p>
          <Button variant="outline" onClick={takeHedge} disabled={!matchup} className="self-start">
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
