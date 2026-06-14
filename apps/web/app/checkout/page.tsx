"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DynamicWidget } from "@dynamic-labs/sdk-react-core";
import type { BlowoutCombo, FixtureResolution } from "@fanguard/polymarket";
import { quoteCover, type CoverQuote } from "@fanguard/pricing";

import { PayPremium } from "~/components/checkout/pay-premium";
import { HedgeDesk } from "~/components/checkout/hedge-desk";
import { TestModeToggle } from "~/lib/test-mode";

function formatUsd(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** Parse a `?price=` value into a positive USD number, or null if absent/invalid. */
function parsePrice(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type QuoteState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "done"; quote: CoverQuote };

// The fixture resolution (combos) only depends on the matchup — NOT the ticket
// price. We fetch it once and re-price in memory as the price changes, so
// editing the price never re-hits the rate-limited Gamma API.
type FixtureState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "done"; combos: BlowoutCombo[] };

export default function CheckoutPage() {
  // useSearchParams must sit under a Suspense boundary for static rendering.
  return (
    <React.Suspense fallback={null}>
      <CheckoutInner />
    </React.Suspense>
  );
}

function CheckoutInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const team = searchParams.get("team");
  const matchup = searchParams.get("q");
  const shutout = searchParams.get("shutout");
  // Ticket price drives the payout target (and so the premium + hedge size). It
  // lives in the URL so the extension can hand it over and links stay shareable.
  const ticketPrice = parsePrice(searchParams.get("price"));

  const [fixture, setFixture] = React.useState<FixtureState>({ state: "idle" });
  // Bumped when the premium settles — auto-runs the hedge desk.
  const [hedgeTrigger, setHedgeTrigger] = React.useState(0);
  const [paid, setPaid] = React.useState(false);
  const [hedgePhase, setHedgePhase] = React.useState<HedgePhase>("idle");

  // Persist a new ticket price to the URL (shareable + extension-readable). The
  // pricing effect re-runs off the changed search param.
  const setTicketPrice = React.useCallback(
    (value: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value > 0) params.set("price", String(value));
      else params.delete("price");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Resolve the fixture once per matchup (fresh odds). Price changes re-quote in
  // memory below — they must NOT re-trigger this Gamma fetch.
  React.useEffect(() => {
    if (!matchup || !team) return;
    let cancelled = false;
    setFixture({ state: "loading" });

    const params = new URLSearchParams({ q: matchup });
    if (shutout) params.set("shutout", shutout);

    fetch(`/api/fixtures?${params.toString()}`)
      .then(async (res) => {
        if (cancelled) return;
        const body = await res.json();
        if (!res.ok) {
          setFixture({ state: "error", message: body.error ?? "Could not price this cover." });
          return;
        }
        const resolution = body as FixtureResolution;
        setFixture({ state: "done", combos: resolution.combos });
      })
      .catch(() => {
        if (!cancelled) {
          setFixture({
            state: "error",
            message: "Network error — could not reach the pricing API.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [matchup, team, shutout]);

  // Derive the priced quote from the resolved combos + the current ticket price.
  // Cheap and in-memory, so editing the price re-prices instantly.
  const quote: QuoteState = React.useMemo(() => {
    if (fixture.state === "loading") return { state: "loading" };
    if (fixture.state === "error") return { state: "error", message: fixture.message };
    if (fixture.state === "idle" || !team) return { state: "idle" };
    const q = quoteCover({ combos: fixture.combos, myTeam: team, ticketPriceUsd: ticketPrice });
    if (!q.triggerCombo) {
      return { state: "error", message: `No blowout line to cover ${team} on this game.` };
    }
    return { state: "done", quote: q };
  }, [fixture, team, ticketPrice]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Fanguard checkout</h1>
        <p className="text-muted-foreground text-sm">
          Log in to spin up your embedded wallet — no seed phrase, no extension.
        </p>
      </header>

      <div className="bg-card text-card-foreground rounded-xl border border-dashed p-3">
        <TestModeToggle />
      </div>

      {team && (
        <FlowStepper
          priced={quote.state === "done"}
          paid={paid}
          hedged={hedgePhase === "done"}
          hedgeFailed={hedgePhase === "error"}
        />
      )}

      {team && (
        <CoverSummary
          team={team}
          matchup={matchup}
          quote={quote}
          ticketPrice={ticketPrice}
          onTicketPrice={setTicketPrice}
        />
      )}

      <div className="bg-card text-card-foreground rounded-xl border p-5">
        <DynamicWidget />
      </div>

      {team && quote.state === "done" && (
        <PayPremium
          premium={quote.quote.premium}
          team={team}
          matchup={matchup}
          onSettled={() => {
            setPaid(true);
            setHedgeTrigger((n) => n + 1);
          }}
        />
      )}

      {team && quote.state === "done" && (
        <HedgeDesk
          team={team}
          matchup={matchup}
          shutout={Boolean(shutout)}
          coverageUsd={quote.quote.payout}
          trigger={hedgeTrigger}
          onPhase={setHedgePhase}
        />
      )}
    </main>
  );
}

type HedgePhase = "idle" | "loading" | "placing" | "done" | "error";

/** Three-step demo tracker: cover priced → premium paid → hedge placed. */
function FlowStepper({
  priced,
  paid,
  hedged,
  hedgeFailed,
}: {
  priced: boolean;
  paid: boolean;
  hedged: boolean;
  hedgeFailed: boolean;
}) {
  const steps = [
    { label: "Cover priced", done: priced },
    { label: "Premium paid", done: paid },
    { label: "Hedge placed", done: hedged, failed: hedgeFailed },
  ];
  // The active step is the first one not yet done.
  const activeIndex = steps.findIndex((s) => !s.done);

  return (
    <ol className="bg-card text-card-foreground flex items-center gap-2 rounded-xl border p-4">
      {steps.map((step, i) => {
        const isActive = i === activeIndex;
        return (
          <React.Fragment key={step.label}>
            <li className="flex items-center gap-2">
              <span
                className={
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold " +
                  (step.failed
                    ? "bg-destructive text-white"
                    : step.done
                      ? "bg-emerald-500 text-white"
                      : isActive
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground")
                }
              >
                {step.failed ? "!" : step.done ? "✓" : i + 1}
              </span>
              <span
                className={
                  "text-xs font-medium " +
                  (step.done || isActive ? "text-foreground" : "text-muted-foreground")
                }
              >
                {step.label}
              </span>
            </li>
            {i < steps.length - 1 && (
              <span className={"h-px flex-1 " + (step.done ? "bg-emerald-500" : "bg-border")} />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

function CoverSummary({
  team,
  matchup,
  quote,
  ticketPrice,
  onTicketPrice,
}: {
  team: string;
  matchup: string | null;
  quote: QuoteState;
  ticketPrice: number | null;
  onTicketPrice: (value: number | null) => void;
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

      <TicketPriceInput value={ticketPrice} onCommit={onTicketPrice} />

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

/**
 * Editable ticket price. The fan (or the extension hand-off) sets what their
 * night is worth; committing writes `?price=` to the URL, which re-prices the
 * cover and sizes the hedge. Local state keeps typing snappy — we only commit
 * on blur / Enter so we don't re-price on every keystroke.
 */
function TicketPriceInput({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (value: number | null) => void;
}) {
  const [draft, setDraft] = React.useState(value != null ? String(value) : "");

  // Keep the field in sync if the URL changes from elsewhere (e.g. extension link).
  React.useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed) {
      onCommit(null);
      return;
    }
    const n = Number.parseFloat(trimmed);
    onCommit(Number.isFinite(n) && n > 0 ? n : null);
  }

  return (
    <label className="flex flex-col gap-1.5 border-t pt-3">
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        Your ticket price
      </span>
      <div className="flex items-center gap-2">
        <div className="border-input bg-background focus-within:ring-ring flex h-10 flex-1 items-center rounded-md border px-3 focus-within:ring-2">
          <span className="text-muted-foreground text-sm">$</span>
          <input
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            placeholder="250"
            className="placeholder:text-muted-foreground ml-1 w-full bg-transparent text-sm outline-none"
          />
        </div>
      </div>
      <span className="text-muted-foreground text-xs">
        We cover your full ticket — the premium and the hedge both size to this.
      </span>
    </label>
  );
}
