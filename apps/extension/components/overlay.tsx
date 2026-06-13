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

        {combo.state === "done" && <CoverOffer data={combo.data} payout={payout} />}
      </div>
    </div>
  );
}

function CoverOffer({
  data,
  payout,
}: {
  data: Extract<ResolveFixtureResponse, { ok: true }>["data"];
  payout: number;
}) {
  // Probability that the night gets ruined: either side runs away with it.
  // The two per-team blowouts are ~mutually exclusive, so we sum them.
  const pBlowout = Math.min(
    0.95,
    data.combos.reduce((sum, c) => sum + c.blowoutProbability, 0),
  );
  if (pBlowout <= 0) {
    return <p className="text-muted-foreground text-sm">No blowout market for this game.</p>;
  }

  const premium = Math.max(MIN_PREMIUM, pBlowout * payout * MARKUP);
  const teams = data.combos.map((c) => c.team);
  const trigger =
    teams.length === 2
      ? `Pays out if ${teams[0]} or ${teams[1]} gets blown out.`
      : `Pays out if ${teams[0] ?? "your team"} gets blown out.`;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">Protect your {formatUsd(payout)} night</p>
      <p className="text-muted-foreground text-xs">{trigger}</p>
      <Button className="mt-1 w-full" size="sm">
        Add cover · {formatUsd(premium)}
      </Button>
    </div>
  );
}
