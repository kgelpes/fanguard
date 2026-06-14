"use client";

import * as React from "react";

import { Button } from "~/components/ui/button";

/**
 * "Behind the button" view of the FanGuard hedge desk. The fan never sees this
 * in production — it's the operator/demo lens showing the offsetting Polymarket
 * order being placed live (deposit wallet, blowout combo, matched fill).
 *
 * Collapsed by default: it's an operator tool, tucked behind a toggle so it
 * doesn't clutter the fan-facing checkout.
 */

interface HedgeStatus {
  depositWallet: string;
  buyingPower: string;
}

interface HedgePreview {
  bestAsk: number | null;
  limitPrice: number;
  shares: number;
  estCostUsd: number;
  reserveUsd: number;
  availableUsd: number;
  sufficient: boolean;
  coverageUsd: number | null;
  coverageShares: number | null;
  coverageCostUsd: number | null;
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
  /** Ticket price the hedge aims to cover, if provided. */
  coverageUsd: number | null;
  /** Shares needed to fully repay the ticket on a blowout (each YES pays $1). */
  coverageShares: number | null;
  /** Est. cost to buy the full coverage at the current fill price. */
  coverageCostUsd: number | null;
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

function formatUsd(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
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
  coverageUsd,
  trigger = 0,
  onPhase,
}: {
  team: string;
  matchup: string | null;
  shutout?: boolean;
  /** Ticket price to cover — the desk sizes its bet to repay this on a blowout. */
  coverageUsd?: number;
  /** Increment to auto-run the hedge (e.g. once the premium settles). */
  trigger?: number;
  /** Reports the desk's phase up to the checkout stepper. */
  onPhase?: (phase: Phase) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [status, setStatus] = React.useState<HedgeStatus | null>(null);
  const [preview, setPreview] = React.useState<HedgePreview | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [result, setResult] = React.useState<HedgeResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    onPhase?.(phase);
  }, [phase, onPhase]);

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

  // Dry-run the order so the desk shows what it'll ACTUALLY buy (and whether
  // it's funded), not just the full-coverage target. Best-effort — the place
  // button works regardless. Only fetched while the panel is open.
  const loadPreview = React.useCallback(async () => {
    if (!matchup) return;
    setPreviewLoading(true);
    try {
      setPreview(
        await postHedge<HedgePreview>({ action: "preview", matchup, team, shutout, coverageUsd }),
      );
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [matchup, team, shutout, coverageUsd]);

  React.useEffect(() => {
    if (open && phase !== "placing" && phase !== "done") void loadPreview();
  }, [open, phase, loadPreview]);

  const takeHedge = React.useCallback(async () => {
    if (!matchup) return;
    setError(null);
    setResult(null);
    setPhase("placing");
    try {
      const res = await postHedge<HedgeResult>({
        action: "place",
        matchup,
        team,
        shutout,
        coverageUsd,
      });
      setResult(res);
      setPhase("done");
      void loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hedge failed.");
      setPhase("error");
    }
  }, [matchup, team, shutout, coverageUsd, loadStatus]);

  // Auto-run when the premium settles (trigger increments).
  React.useEffect(() => {
    if (trigger > 0) void takeHedge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const placing = phase === "placing";

  // One-line status shown in the collapsed header so you can glance without opening.
  const summary =
    phase === "placing"
      ? "placing…"
      : phase === "done"
        ? "✓ hedge placed"
        : phase === "error"
          ? "⚠ needs attention"
          : status
            ? `${status.buyingPower} pUSD ready`
            : "…";

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-4 rounded-xl border p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs font-medium">Behind the button</span>
          <span className="text-muted-foreground text-xs">How your cover is funded</span>
        </div>
        <div className="flex items-center gap-2">
          {!open && <span className="text-muted-foreground text-xs">{summary}</span>}
          <span className="text-muted-foreground text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <>
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

          {/* What the desk will ACTUALLY place this round (sized to the book + budget). */}
          {phase !== "done" && preview && (
            <div className="flex flex-col gap-1 border-t pt-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">About to place</span>
                <span className="tabular-nums font-medium">
                  {preview.shares} shares @ {preview.limitPrice} (≈ ${preview.reserveUsd.toFixed(2)}
                  )
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Cost / available</span>
                <span
                  className={
                    "tabular-nums " + (preview.sufficient ? "text-emerald-600" : "text-amber-600")
                  }
                >
                  ${preview.reserveUsd.toFixed(2)} / ${preview.availableUsd.toFixed(2)}
                  {preview.sufficient ? " · funded" : " · pay premium to fund"}
                </span>
              </div>
              {preview.coverageUsd != null && preview.coverageShares != null && (
                <p className="text-muted-foreground text-xs">
                  Full coverage would be {formatUsd(preview.coverageUsd)} (~{preview.coverageShares}{" "}
                  shares); this round places the minimum to prove the hedge.
                </p>
              )}
            </div>
          )}
          {phase !== "done" && !preview && previewLoading && (
            <p className="text-muted-foreground border-t pt-3 text-xs">Sizing the order…</p>
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
              {result.coverageUsd != null && result.coverageShares != null && (
                <p className="text-muted-foreground text-xs">
                  Full coverage of the {formatUsd(result.coverageUsd)} ticket needs{" "}
                  <span className="font-medium tabular-nums">{result.coverageShares}</span> shares
                  (~${(result.coverageCostUsd ?? 0).toFixed(2)} at {result.limitPrice}).
                  {result.shares < result.coverageShares
                    ? ` Placed ${result.shares} this round (demo budget / buying power) — top up to scale to full coverage.`
                    : " Fully covered."}
                </p>
              )}
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
              <Button
                variant="outline"
                onClick={takeHedge}
                disabled={!matchup}
                className="self-start"
              >
                Try again
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
