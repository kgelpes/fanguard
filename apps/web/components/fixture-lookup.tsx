"use client";

import * as React from "react";
import Link from "next/link";
import type { BlowoutCombo, FixtureResolution } from "@fanguard/polymarket";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type Status =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "done"; data: FixtureResolution };

const EXAMPLES = [
  "Seattle Sounders vs Real Salt Lake",
  "Bodø/Glimt vs Hamarkameratene - Eliteserien",
  "Brazil vs Morocco - World Cup - Group C",
];

function formatPercent(probability: number): string {
  return `${(probability * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

export function FixtureLookup() {
  const [query, setQuery] = React.useState("");
  const [shutout, setShutout] = React.useState(false);
  const [status, setStatus] = React.useState<Status>({ state: "idle" });

  async function lookup(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setStatus({ state: "loading" });
    try {
      const params = new URLSearchParams({ q: trimmed });
      if (shutout) params.set("shutout", "1");
      const res = await fetch(`/api/fixtures?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) {
        setStatus({ state: "error", message: body.error ?? "Lookup failed." });
        return;
      }
      setStatus({ state: "done", data: body as FixtureResolution });
    } catch {
      setStatus({ state: "error", message: "Network error — could not reach the API." });
    }
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(query);
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Brazil vs Morocco — or paste a ticket title"
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
          />
          <Button type="submit" disabled={status.state === "loading"}>
            {status.state === "loading" ? "Finding…" : "Find combo"}
          </Button>
        </div>
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={shutout}
            onChange={(e) => setShutout(e.target.checked)}
            className="size-4"
          />
          Stack a clean-sheet leg (rarer “ruined night” trigger)
        </label>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setQuery(example);
                void lookup(example);
              }}
              className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-full border px-3 py-1 text-xs transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      </form>

      {status.state === "error" && (
        <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {status.message}
        </p>
      )}

      {status.state === "done" && <ResolutionView data={status.data} shutout={shutout} />}
    </div>
  );
}

function ResolutionView({ data, shutout }: { data: FixtureResolution; shutout: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card text-card-foreground rounded-lg border p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{data.event.title}</h2>
          {!data.event.confident && (
            <span className="text-muted-foreground text-xs">low-confidence match</span>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {data.event.slug}
          {data.event.startDate
            ? ` · ${new Date(data.event.startDate).toLocaleDateString()}`
            : ""}{" "}
          · {data.spreads.length} spread markets
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {data.combos.map((combo) => (
          <ComboCard key={combo.team} combo={combo} query={data.query.raw} shutout={shutout} />
        ))}
      </div>
    </div>
  );
}

function ComboCard({
  combo,
  query,
  shutout,
}: {
  combo: BlowoutCombo;
  query: string;
  shutout: boolean;
}) {
  // This card is "{combo.team} win big" — the blowout a {combo.opponent} fan
  // fears. So the cover is bought by the opponent's fan; pass that team to
  // checkout so it can price the right trigger.
  const params = new URLSearchParams({ q: query, team: combo.opponent });
  if (shutout) params.set("shutout", "1");
  const coverHref = `/checkout?${params.toString()}`;

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <p className="text-muted-foreground text-xs uppercase tracking-wide">Blowout combo</p>
        <h3 className="text-base font-semibold">{combo.team} win big</h3>
      </div>

      <ul className="flex flex-col gap-1.5">
        {combo.legs.map((leg) => (
          <li key={leg.marketSlug} className="flex items-center justify-between gap-2 text-sm">
            <span>{leg.selection}</span>
            <span className="text-muted-foreground tabular-nums">
              {formatPercent(leg.probability)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-center justify-between border-t pt-3 text-sm">
        <span className="text-muted-foreground">
          Implied chance
          {combo.independenceApprox && <span title="independence approximation"> *</span>}
        </span>
        <span className={cn("font-semibold tabular-nums")}>
          {formatPercent(combo.blowoutProbability)} · {combo.comboMultiplier.toFixed(1)}×
        </span>
      </div>

      <Button asChild className="w-full">
        <Link href={coverHref}>Cover {combo.opponent}</Link>
      </Button>
    </div>
  );
}
