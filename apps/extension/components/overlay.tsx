import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { quoteCover } from "@fanguard/pricing";
import type { ComboLeg } from "@fanguard/polymarket";

import { Button } from "~/components/ui/button";
import type { DetectedEvent } from "~/lib/event-detection";
import type { ResolveFixtureResponse } from "~/lib/messages";

// The brand shield, served from the extension and made web-accessible to the
// StubHub page (see wxt.config.ts) so it renders inside the content-script
// Shadow DOM.
const SHIELD_URL = browser.runtime.getURL("/fanguard-shield.png");

// Pricing follows the pass-through model (see @fanguard/pricing): read the
// market's blowout probability and mark it up modestly, auto-stacking the
// shutout leg when the cover would otherwise be too pricey. Probability hidden.
const FALLBACK_PAYOUT = 250;

// Where the "Add cover" hand-off opens. WXT inlines WXT_PUBLIC_* at build time.
const WEB_APP_URL = import.meta.env.WXT_PUBLIC_API_URL ?? "http://localhost:3000";

type ComboState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "done"; data: Extract<ResolveFixtureResponse, { ok: true }>["data"] };

function formatUsd(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * Plain-language refund condition for a combo leg, in the fan's terms — e.g.
 * "France is beaten by 3 or more goals". Mirrors the web checkout so the
 * hand-off reads identically. A spread line of 2.5 means the favorite must win
 * by MORE than 2.5, i.e. the fan's team loses by 3+.
 */
function legCondition(leg: ComboLeg, teamName: string): string {
  if (leg.line != null) {
    const goals = Math.floor(leg.line) + 1;
    return `${teamName} is beaten by ${goals} or more goal${goals === 1 ? "" : "s"}`;
  }
  // The clean-sheet proxy leg (BTTS "No") in the fan's terms.
  if (/both teams to score/i.test(leg.selection) || /-btts$/.test(leg.marketSlug)) {
    return `${teamName} never scores`;
  }
  return leg.selection;
}

function formatKickoff(startDate: string | null): string | null {
  if (!startDate) return null;
  const time = Date.parse(startDate);
  if (Number.isNaN(time)) return null;
  return new Date(time).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function Overlay({ event }: { event: DetectedEvent }) {
  const [open, setOpen] = useState(true);
  const [combo, setCombo] = useState<ComboState>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    browser.runtime
      .sendMessage({ type: "RESOLVE_FIXTURE", query: event.name })
      .then((response: ResolveFixtureResponse) => {
        if (cancelled) return;
        if (response?.ok) setCombo({ state: "done", data: response.data });
        else setCombo({ state: "error", message: response?.error ?? "Could not price this cover." });
      })
      .catch(() => {
        if (!cancelled) setCombo({ state: "error", message: "Could not reach FanGuard." });
      });
    return () => {
      cancelled = true;
    };
  }, [event.name]);

  if (!open) {
    return (
      <div className="fixed bottom-4 right-4 z-[2147483647]">
        <Button size="sm" onClick={() => setOpen(true)}>
          <img src={SHIELD_URL} alt="" className="mr-1.5 size-4" />
          FanGuard
        </Button>
      </div>
    );
  }

  const kickoff = formatKickoff(event.startDate);
  const matchup = event.teamA && event.teamB ? `${event.teamA} vs ${event.teamB}` : event.name;
  const payout = event.priceUsd ?? FALLBACK_PAYOUT;

  return (
    <div className="bg-card text-card-foreground fixed bottom-4 right-4 z-[2147483647] w-80 rounded-xl border p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <img src={SHIELD_URL} alt="" className="size-5" />
          <span className="text-sm font-semibold tracking-tight">FanGuard</span>
        </span>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Hide
        </Button>
      </div>

      <div className="mt-2">
        <p className="text-sm font-semibold leading-tight">{matchup}</p>
        <p className="text-muted-foreground text-xs">
          {[kickoff, event.venue].filter(Boolean).join(" · ") || "Live event"}
          {event.priceUsd != null ? ` · ${formatUsd(event.priceUsd)} ticket` : ""}
        </p>
      </div>

      <div className="mt-3 border-t pt-3">
        {combo.state === "loading" && (
          <p className="text-muted-foreground text-sm">Pricing your cover…</p>
        )}

        {combo.state === "error" && (
          <p className="text-muted-foreground text-sm">{combo.message}</p>
        )}

        {combo.state === "done" && (
          <CoverOffer
            data={combo.data}
            payout={payout}
            matchup={matchup}
            ticketPriceUsd={event.priceUsd}
          />
        )}
      </div>
    </div>
  );
}

function CoverOffer({
  data,
  payout,
  matchup,
  ticketPriceUsd,
}: {
  data: Extract<ResolveFixtureResponse, { ok: true }>["data"];
  payout: number;
  matchup: string;
  ticketPriceUsd: number | null;
}) {
  const [myTeam, setMyTeam] = useState<string | null>(null);

  if (data.combos.length === 0) {
    return <p className="text-muted-foreground text-sm">No blowout cover for this game.</p>;
  }

  // Both team names, derived from either combo (team + its opponent).
  const teams = [data.combos[0]!.team, data.combos[0]!.opponent];

  // Step 1: which team is the fan here for?
  if (!myTeam) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Who are you here for?</p>
        <div className="flex gap-2">
          {teams.map((team) => (
            <Button
              key={team}
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setMyTeam(team)}
            >
              {team}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // Step 2: cover priced to MY team getting blown out — i.e. the opponent
  // running away with it. quoteCover picks the trigger combo and auto-stacks the
  // shutout leg when the bare spread cover would be too expensive.
  const quote = quoteCover({
    combos: data.combos,
    myTeam,
    ticketPriceUsd: payout,
    shutoutLeg: data.shutoutLeg,
  });
  if (!quote.triggerCombo) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          No blowout line to cover {myTeam} on this game.
        </p>
        <button className="text-muted-foreground text-xs underline" onClick={() => setMyTeam(null)}>
          Pick a different team
        </button>
      </div>
    );
  }

  const premium = quote.premium;

  // Hand off to the web checkout, carrying the ticket price in the URL so it
  // re-prices the cover and sizes the hedge to the fan's real night.
  function openCheckout() {
    const params = new URLSearchParams({ q: matchup, team: myTeam! });
    if (ticketPriceUsd != null) params.set("price", String(Math.round(ticketPriceUsd)));
    window.open(`${WEB_APP_URL}/checkout?${params.toString()}`, "_blank", "noopener");
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg font-semibold leading-tight tracking-tight text-balance">
        Protect your {formatUsd(payout)} ticket
      </p>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium">
          Your {formatUsd(payout)} ticket is refunded if:
        </p>
        <ul className="flex flex-col gap-1.5">
          {quote.triggerCombo.legs.map((leg) => (
            <li key={leg.marketSlug} className="flex items-start gap-2 text-xs">
              <span
                aria-hidden
                className="bg-primary/10 text-primary mt-px flex size-4 shrink-0 items-center justify-center rounded-full text-[9px]"
              >
                ✓
              </span>
              <span>{legCondition(leg, myTeam)}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-[11px] text-balance">
          A close game won’t pay out — this is for the kind where you stop watching and start
          thinking about the drive home.
        </p>
      </div>

      <Button className="w-full" size="sm" onClick={openCheckout}>
        Add cover · {formatUsd(premium)}
      </Button>
      <button
        className="text-muted-foreground self-start text-xs underline"
        onClick={() => setMyTeam(null)}
      >
        Not your team? Change
      </button>
    </div>
  );
}
