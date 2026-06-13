"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { DynamicWidget } from "@dynamic-labs/sdk-react-core";
import { useAccount, useSignMessage } from "wagmi";
import type { FixtureResolution } from "@fanguard/polymarket";
import { quoteCover, type CoverQuote } from "@fanguard/pricing";

import { Button } from "~/components/ui/button";
import { PayPremium } from "~/components/checkout/pay-premium";

const TEST_MESSAGE = "Welcome to Fanguard — sign to prove this wallet is yours.";

function formatUsd(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

type QuoteState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "done"; quote: CoverQuote };

export default function CheckoutPage() {
  // useSearchParams must sit under a Suspense boundary for static rendering.
  return (
    <React.Suspense fallback={null}>
      <CheckoutInner />
    </React.Suspense>
  );
}

function CheckoutInner() {
  const searchParams = useSearchParams();
  const team = searchParams.get("team");
  const matchup = searchParams.get("q");
  const shutout = searchParams.get("shutout");

  const [quote, setQuote] = React.useState<QuoteState>({ state: "idle" });

  // Re-resolve the fixture at checkout time (fresh odds) and price the cover.
  React.useEffect(() => {
    if (!matchup || !team) return;
    let cancelled = false;
    setQuote({ state: "loading" });

    const params = new URLSearchParams({ q: matchup });
    if (shutout) params.set("shutout", shutout);

    fetch(`/api/fixtures?${params.toString()}`)
      .then(async (res) => {
        if (cancelled) return;
        const body = await res.json();
        if (!res.ok) {
          setQuote({ state: "error", message: body.error ?? "Could not price this cover." });
          return;
        }
        const resolution = body as FixtureResolution;
        const q = quoteCover({ combos: resolution.combos, myTeam: team });
        if (!q.triggerCombo) {
          setQuote({ state: "error", message: `No blowout line to cover ${team} on this game.` });
          return;
        }
        setQuote({ state: "done", quote: q });
      })
      .catch(() => {
        if (!cancelled) {
          setQuote({ state: "error", message: "Network error — could not reach the pricing API." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [matchup, team, shutout]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Fanguard checkout</h1>
        <p className="text-muted-foreground text-sm">
          Log in to spin up your embedded wallet — no seed phrase, no extension.
        </p>
      </header>

      {team && <CoverSummary team={team} matchup={matchup} quote={quote} />}

      <div className="bg-card text-card-foreground rounded-xl border p-5">
        <DynamicWidget />
      </div>

      {team && quote.state === "done" && (
        <PayPremium premium={quote.quote.premium} team={team} matchup={matchup} />
      )}

      <WalletPanel />
    </main>
  );
}

function CoverSummary({
  team,
  matchup,
  quote,
}: {
  team: string;
  matchup: string | null;
  quote: QuoteState;
}) {
  // Loss-framed: dollars only, probability hidden (see CONTEXT.md). We surface
  // WHAT triggers a payout (plain-English legs) but never HOW LIKELY.
  return (
    <div className="bg-card text-card-foreground flex flex-col gap-3 rounded-xl border p-5">
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs uppercase tracking-wide">
          Protect your night
        </span>
        <h2 className="text-xl font-semibold">
          {quote.state === "done"
            ? `Protect your ${formatUsd(quote.quote.payout)} night`
            : `Cover for ${team}`}
        </h2>
        <p className="text-muted-foreground text-sm">
          Pays out if {team} gets blown out{matchup ? ` · ${matchup}` : ""}.
        </p>
      </div>

      {quote.state === "loading" && (
        <p className="text-muted-foreground text-sm">Pricing tonight’s cover…</p>
      )}

      {quote.state === "error" && <p className="text-destructive text-sm">{quote.message}</p>}

      {quote.state === "done" && (
        <>
          <ul className="flex flex-col gap-1 border-t pt-3">
            {quote.quote.triggerCombo?.legs.map((leg) => (
              <li key={leg.marketSlug} className="text-muted-foreground text-sm">
                {leg.selection}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm font-medium">Tonight’s premium</span>
            <span className="text-lg font-semibold tabular-nums">
              {formatUsd(quote.quote.premium)}
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            Pay below — Dynamic Flow settles your premium in USDC on Polygon.
          </p>
        </>
      )}
    </div>
  );
}

function WalletPanel() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync, isPending } = useSignMessage();
  const [signature, setSignature] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSign() {
    setError(null);
    setSignature(null);
    try {
      const sig = await signMessageAsync({ message: TEST_MESSAGE });
      setSignature(sig);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signing was cancelled.");
    }
  }

  if (!isConnected || !address) return null;

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-4 rounded-xl border p-5">
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs uppercase tracking-wide">
          Embedded wallet
        </span>
        <span className="font-mono text-sm break-all">{address}</span>
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <p className="text-sm font-medium">Sign a test message</p>
        <p className="text-muted-foreground text-xs">“{TEST_MESSAGE}”</p>
        <Button onClick={handleSign} disabled={isPending} className="mt-1 self-start">
          {isPending ? "Check your wallet…" : "Sign test message"}
        </Button>
      </div>

      {signature && (
        <div className="flex flex-col gap-1 border-t pt-4">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">Signature</span>
          <span className="font-mono text-xs break-all">{signature}</span>
        </div>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
