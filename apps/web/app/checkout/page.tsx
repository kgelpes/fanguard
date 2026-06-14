"use client";

import * as React from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DynamicWidget } from "@dynamic-labs/sdk-react-core";
import type { BlowoutCombo, FixtureResolution } from "@fanguard/polymarket";
import { quoteCover, type CoverQuote } from "@fanguard/pricing";

import { HedgeDesk } from "~/components/checkout/hedge-desk";
import { PayFlow } from "~/components/checkout/pay-flow";
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
    <main className="bg-background mx-auto flex min-h-screen w-full max-w-md flex-col gap-7 px-5 py-10">
      <header className="flex flex-col items-center gap-3 text-center">
        <Image
          src="/fanguard-shield.png"
          alt="FanGuard"
          width={64}
          height={64}
          priority
          className="h-16 w-16"
        />
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-base font-semibold tracking-tight">FanGuard</h1>
          <p className="text-muted-foreground text-xs">Insure your night. One tap.</p>
        </div>
      </header>

      {!team ? (
        <EmptyState />
      ) : (
        <>
          <Hero
            team={team}
            matchup={matchup}
            quote={quote}
            ticketPrice={ticketPrice}
            onTicketPrice={setTicketPrice}
          />

          {quote.state === "done" && (
            <Steps
              priced
              paid={paid}
              hedged={hedgePhase === "done"}
              hedgeFailed={hedgePhase === "error"}
            />
          )}

          <div className="flex justify-center">
            <DynamicWidget />
          </div>

          {quote.state === "done" && (
            <PayFlow
              premium={quote.quote.premium}
              team={team}
              matchup={matchup}
              onPaid={() => {
                setPaid(true);
                setHedgeTrigger((n) => n + 1);
              }}
            />
          )}

          {quote.state === "done" && (
            <footer className="mt-1 flex flex-col gap-4">
              <HedgeDesk
                team={team}
                matchup={matchup}
                shutout={Boolean(shutout)}
                coverageUsd={quote.quote.payout}
                trigger={hedgeTrigger}
                onPhase={setHedgePhase}
              />
              <div className="flex justify-center">
                <TestModeToggle className="justify-center" />
              </div>
            </footer>
          )}
        </>
      )}
    </main>
  );
}

type HedgePhase = "idle" | "loading" | "placing" | "done" | "error";

/** No deep-link context — the checkout is normally opened from a ticket. */
function EmptyState() {
  return (
    <div className="bg-card text-card-foreground flex flex-col items-center gap-2 rounded-xl border p-8 text-center">
      <h2 className="font-display text-lg font-semibold">No game selected</h2>
      <p className="text-muted-foreground text-sm text-balance">
        Open FanGuard from your ticket at checkout to protect your night — or look up a game to start.
      </p>
      <a
        href="/"
        className="text-primary mt-1 text-sm font-medium underline-offset-4 hover:underline"
      >
        Look up a game
      </a>
    </div>
  );
}

/**
 * The emotional hero: the dollars you're protecting, loss-framed and large (the
 * Dollars-Are-The-Headline rule), with the plain-English trigger and the price
 * you set. Probability stays hidden (see CONTEXT.md / PRODUCT.md).
 */
function Hero({
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
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 text-center">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-balance">
          {quote.state === "done"
            ? `Protect your ${formatUsd(quote.quote.payout)} night`
            : `Cover for ${team}`}
        </h2>
        <p className="text-muted-foreground text-sm text-balance">
          Pays out if {team} gets blown out{matchup ? ` · ${matchup}` : ""}.
        </p>
      </div>

      {quote.state === "loading" && (
        <p className="text-muted-foreground text-center text-sm">Pricing tonight’s cover…</p>
      )}
      {quote.state === "error" && (
        <p className="text-destructive text-center text-sm">{quote.message}</p>
      )}

      {quote.state === "done" && (
        <div className="bg-card text-card-foreground flex flex-col gap-4 rounded-xl border p-5">
          <ul className="flex flex-col gap-2">
            {quote.quote.triggerCombo?.legs.map((leg) => (
              <li key={leg.marketSlug} className="flex items-start gap-2.5 text-sm">
                <span
                  aria-hidden
                  className="bg-primary/10 text-primary mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]"
                >
                  ✓
                </span>
                <span>{leg.selection}</span>
              </li>
            ))}
          </ul>
          <TicketPriceInput value={ticketPrice} onCommit={onTicketPrice} />
        </div>
      )}
    </section>
  );
}

/** Slim, calm progress — three dots, brand navy. Not a heavy bordered card. */
function Steps({
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
    { label: "Priced", done: priced, failed: false },
    { label: "Paid", done: paid, failed: false },
    { label: "Secured", done: hedged, failed: hedgeFailed },
  ];
  const activeIndex = steps.findIndex((s) => !s.done);

  return (
    <ol className="flex items-center justify-center gap-2">
      {steps.map((step, i) => {
        const isActive = i === activeIndex;
        return (
          <React.Fragment key={step.label}>
            <li className="flex items-center gap-1.5">
              <span
                className={
                  "size-2 rounded-full transition-colors " +
                  (step.failed
                    ? "bg-destructive"
                    : step.done
                      ? "bg-primary"
                      : isActive
                        ? "bg-primary/40"
                        : "bg-border")
                }
              />
              <span
                className={
                  "text-xs " +
                  (step.done || isActive ? "text-foreground font-medium" : "text-muted-foreground")
                }
              >
                {step.label}
              </span>
            </li>
            {i < steps.length - 1 && (
              <span className={"h-px w-5 " + (step.done ? "bg-primary/40" : "bg-border")} />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

/**
 * Editable ticket price. The fan (or the extension hand-off) sets what their
 * night is worth; committing writes `?price=` to the URL, which re-prices the
 * cover. Local state keeps typing snappy — we commit on blur / Enter.
 */
function TicketPriceInput({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (value: number | null) => void;
}) {
  const [draft, setDraft] = React.useState(value != null ? String(value) : "");

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
    <label className="flex flex-col gap-1.5 border-t pt-4">
      <span className="text-muted-foreground text-xs font-medium">Your ticket price</span>
      <div className="border-input bg-background focus-within:ring-ring flex h-10 items-center rounded-lg border px-3 focus-within:ring-2">
        <span className="text-muted-foreground text-sm">$</span>
        <input
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="250"
          className="placeholder:text-muted-foreground ml-1 w-full bg-transparent text-sm outline-none"
        />
      </div>
      <span className="text-muted-foreground text-xs">
        We cover your full ticket — set it to what tonight’s worth to you.
      </span>
    </label>
  );
}
