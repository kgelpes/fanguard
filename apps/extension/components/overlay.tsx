import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

import { Button } from "~/components/ui/button";
import type { DetectedEvent } from "~/lib/event-detection";
import type { ResolveFixtureResponse } from "~/lib/messages";

// Pricing follows the pass-through model: read the market's blowout probability
// and mark it up modestly. The probability itself is hidden from the fan.
const MARKUP = 1.15;
const MIN_PREMIUM = 5;
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
        else setCombo({ state: "error", message: response?.error ?? "Could not price this game." });
      })
      .catch(() => {
        if (!cancelled) setCombo({ state: "error", message: "Could not reach Fanguard." });
      });
    return () => {
      cancelled = true;
    };
  }, [event.name]);

  if (!open) {
    return (
      <div className="fixed bottom-4 right-4 z-[2147483647]">
        <Button size="sm" onClick={() => setOpen(true)}>
          Fanguard
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
        <span className="text-sm font-semibold">Fanguard</span>
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
          <p className="text-muted-foreground text-sm">Checking tonight’s cover…</p>
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
    return <p className="text-muted-foreground text-sm">No blowout market for this game.</p>;
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
  // running away with it (the combo whose opponent is my team).
  const triggerCombo = data.combos.find((c) => c.opponent === myTeam);
  if (!triggerCombo) {
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

  const pBlowout = Math.min(0.95, triggerCombo.blowoutProbability);
  const premium = Math.max(MIN_PREMIUM, pBlowout * payout * MARKUP);

  // Hand off to the web checkout, carrying the ticket price in the URL so it
  // re-prices the cover and sizes the hedge to the fan's real night.
  function openCheckout() {
    const params = new URLSearchParams({ q: matchup, team: myTeam!, shutout: "1" });
    if (ticketPriceUsd != null) params.set("price", String(Math.round(ticketPriceUsd)));
    window.open(`${WEB_APP_URL}/checkout?${params.toString()}`, "_blank", "noopener");
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">Protect your {formatUsd(payout)} night</p>
      <p className="text-muted-foreground text-xs">Pays out if {myTeam} gets blown out.</p>
      <Button className="mt-1 w-full" size="sm" onClick={openCheckout}>
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
