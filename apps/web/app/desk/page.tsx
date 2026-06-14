"use client";

import * as React from "react";
import { DynamicWidget } from "@dynamic-labs/sdk-react-core";
import { erc20Abi, parseUnits } from "viem";
import { useAccount, useConfig, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { getPublicClient } from "wagmi/actions";

import { Button } from "~/components/ui/button";
import { coverPoolAbi } from "~/lib/cover-pool/abi";
import {
  coverPoolAddress,
  COVERPOOL_CHAIN_ID,
  COVERPOOL_COLLATERAL_DECIMALS,
  isCoverPoolConfigured,
} from "~/lib/cover-pool/config";
import { POLYGON_USDC_E } from "~/lib/flow/config";

// ── Types (mirror /api/desk "state") ────────────────────────────────────────
interface DeskGame {
  gameId: string;
  threshold: number;
  exposureCapUsd: number;
  totalPayoutUsd: number;
  resolved: boolean;
  blowout: boolean;
  margin: number;
}
interface DeskPolicy {
  policyId: string;
  gameId: string;
  holder: string;
  payoutUsd: number;
  premiumUsd: number;
  claimed: boolean;
}
interface DeskState {
  address: string;
  settler: string;
  owner: string;
  totalAssetsUsd: number;
  freeAssetsUsd: number;
  lockedExposureUsd: number;
  totalShares: string;
  games: DeskGame[];
  policies: DeskPolicy[];
}

const COLLATERAL = POLYGON_USDC_E as `0x${string}`;

function usd(n: number): string {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}
function short(v: string, lead = 6, tail = 4): string {
  return v.length > lead + tail ? `${v.slice(0, lead)}…${v.slice(-tail)}` : v;
}

async function postDesk<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/desk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Desk request failed (${res.status}).`);
  return data;
}

export default function DeskPage() {
  if (!isCoverPoolConfigured()) {
    return (
      <Shell>
        <div className="bg-card text-card-foreground rounded-xl border p-6 text-sm">
          <h2 className="mb-1 font-semibold">CoverPool not configured</h2>
          <p className="text-muted-foreground">
            Set <code>NEXT_PUBLIC_COVERPOOL_ADDRESS</code> (and <code>SETTLER_PRIVATE_KEY</code> for
            resolve/claim) to enable the Desk.
          </p>
        </div>
      </Shell>
    );
  }
  return <Desk />;
}

function Desk() {
  const [state, setState] = React.useState<DeskState | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      setState(await postDesk<DeskState>({ action: "state" }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Desk state.");
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <DynamicWidget />
        <button onClick={() => void refresh()} className="text-muted-foreground text-xs underline">
          Refresh
        </button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <VaultCard state={state} onChange={refresh} />
      <GamesCard state={state} onChange={refresh} />
      <PoliciesCard state={state} onChange={refresh} />
      <p className="text-muted-foreground text-center text-xs">
        Operator console · unlisted, unauthenticated (demo). Settler actions run with the server
        key.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-background mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-5 py-10">
      <header className="flex flex-col gap-0.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">FanGuard Desk</h1>
        <p className="text-muted-foreground text-sm">
          The book behind the button — vault, games, payouts.
        </p>
      </header>
      {children}
    </main>
  );
}

// ── Vault + LP deposit/withdraw ─────────────────────────────────────────────
function VaultCard({
  state,
  onChange,
}: {
  state: DeskState | null;
  onChange: () => Promise<void>;
}) {
  const { address, isConnected } = useAccount();
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const pool = coverPoolAddress();

  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState<null | "deposit" | "withdraw">(null);
  const [err, setErr] = React.useState<string | null>(null);

  const { data: myShares, refetch: refetchShares } = useReadContract({
    address: pool ?? undefined,
    abi: coverPoolAbi,
    functionName: "sharesOf",
    args: address ? [address] : undefined,
    chainId: COVERPOOL_CHAIN_ID,
    query: { enabled: Boolean(address && pool) },
  });

  const run = React.useCallback(
    async (kind: "deposit" | "withdraw") => {
      if (!pool || !address) return;
      setErr(null);
      setBusy(kind);
      try {
        const publicClient = getPublicClient(config, { chainId: COVERPOOL_CHAIN_ID });
        await switchChainAsync({ chainId: COVERPOOL_CHAIN_ID }).catch(() => {});

        if (kind === "deposit") {
          const units = parseUnits(amount || "0", COVERPOOL_COLLATERAL_DECIMALS);
          if (units <= 0n) throw new Error("Enter an amount to deposit.");
          const approveHash = await writeContractAsync({
            address: COLLATERAL,
            abi: erc20Abi,
            functionName: "approve",
            args: [pool, units],
            chainId: COVERPOOL_CHAIN_ID,
          });
          await publicClient?.waitForTransactionReceipt({ hash: approveHash });
          const depHash = await writeContractAsync({
            address: pool,
            abi: coverPoolAbi,
            functionName: "deposit",
            args: [units],
            chainId: COVERPOOL_CHAIN_ID,
          });
          await publicClient?.waitForTransactionReceipt({ hash: depHash });
        } else {
          const shares = (myShares as bigint | undefined) ?? 0n;
          if (shares <= 0n) throw new Error("No shares to withdraw.");
          const wHash = await writeContractAsync({
            address: pool,
            abi: coverPoolAbi,
            functionName: "withdraw",
            args: [shares],
            chainId: COVERPOOL_CHAIN_ID,
          });
          await publicClient?.waitForTransactionReceipt({ hash: wHash });
        }
        setAmount("");
        await Promise.all([onChange(), refetchShares()]);
      } catch (e) {
        setErr(
          e instanceof Error ? (e.message.split("\n")[0] ?? e.message) : "Transaction failed.",
        );
      } finally {
        setBusy(null);
      }
    },
    [
      pool,
      address,
      amount,
      config,
      switchChainAsync,
      writeContractAsync,
      myShares,
      onChange,
      refetchShares,
    ],
  );

  return (
    <section className="bg-card text-card-foreground flex flex-col gap-4 rounded-xl border p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Vault</h2>
        <a
          href={state ? `https://polygonscan.com/address/${state.address}` : "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground font-mono text-xs underline"
        >
          {state ? short(state.address) : "…"}
        </a>
      </div>

      <dl className="grid grid-cols-3 gap-3 text-sm">
        <Metric label="Total assets" value={state ? usd(state.totalAssetsUsd) : "…"} />
        <Metric label="Free (LP-withdrawable)" value={state ? usd(state.freeAssetsUsd) : "…"} />
        <Metric label="Locked exposure" value={state ? usd(state.lockedExposureUsd) : "…"} />
      </dl>
      {state && state.totalAssetsUsd === 0 && (
        <p className="text-amber-600 text-xs">
          Vault is empty — deposit USDC.e below so a payout larger than the premium can mint.
        </p>
      )}

      {!isConnected ? (
        <p className="text-muted-foreground text-sm">
          Connect a wallet to add or withdraw LP capital.
        </p>
      ) : (
        <div className="flex flex-col gap-2 border-t pt-4">
          <div className="flex items-center gap-2">
            <div className="border-input flex h-10 flex-1 items-center rounded-lg border px-3">
              <span className="text-muted-foreground text-sm">$</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="250"
                className="ml-1 w-full bg-transparent text-sm outline-none"
              />
              <span className="text-muted-foreground text-xs">USDC.e</span>
            </div>
            <Button onClick={() => void run("deposit")} disabled={busy !== null}>
              {busy === "deposit" ? "Depositing…" : "Deposit"}
            </Button>
          </div>
          <button
            onClick={() => void run("withdraw")}
            disabled={busy !== null}
            className="text-muted-foreground hover:text-foreground self-start text-xs underline disabled:opacity-50"
          >
            {busy === "withdraw"
              ? "Withdrawing…"
              : "Withdraw all my shares (capped at free assets)"}
          </button>
          {err && <p className="text-destructive text-xs">{err}</p>}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-display tabular-nums text-base font-semibold">{value}</dd>
    </div>
  );
}

// ── Games + resolve ─────────────────────────────────────────────────────────
function GamesCard({
  state,
  onChange,
}: {
  state: DeskState | null;
  onChange: () => Promise<void>;
}) {
  return (
    <section className="bg-card text-card-foreground flex flex-col gap-3 rounded-xl border p-5">
      <h2 className="font-semibold">Games</h2>
      {!state ? (
        <p className="text-muted-foreground text-sm">…</p>
      ) : state.games.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No games opened yet — they open on the first policy.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {state.games.map((g) => (
            <GameRow key={g.gameId} game={g} onChange={onChange} />
          ))}
        </ul>
      )}
    </section>
  );
}

function GameRow({ game, onChange }: { game: DeskGame; onChange: () => Promise<void> }) {
  const [margin, setMargin] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const resolve = React.useCallback(async () => {
    const m = Number(margin);
    if (!Number.isInteger(m) || m < 0) {
      setErr("Margin must be a whole number (goals/points the insured team lost by).");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await postDesk({ action: "resolve", gameId: game.gameId, margin: m });
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Resolve failed.");
    } finally {
      setBusy(false);
    }
  }, [margin, game.gameId, onChange]);

  return (
    <li className="flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs">game {short(game.gameId, 6, 4)}</span>
        <span className="text-muted-foreground text-xs">
          threshold {game.threshold} · payouts {usd(game.totalPayoutUsd)} / cap{" "}
          {usd(game.exposureCapUsd)}
        </span>
      </div>
      {game.resolved ? (
        <span
          className={
            "text-xs font-medium " + (game.blowout ? "text-emerald-600" : "text-muted-foreground")
          }
        >
          ✓ resolved — margin {game.margin} · {game.blowout ? "BLOWOUT (claims pay)" : "no blowout"}
        </span>
      ) : (
        <div className="flex items-center gap-2">
          <div className="border-input flex h-9 w-28 items-center rounded-md border px-2">
            <input
              inputMode="numeric"
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
              placeholder="margin"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <Button onClick={() => void resolve()} disabled={busy} className="h-9">
            {busy ? "Resolving…" : "Resolve"}
          </Button>
          <span className="text-muted-foreground text-xs">final margin → settler writes it</span>
        </div>
      )}
      {err && <p className="text-destructive text-xs">{err}</p>}
    </li>
  );
}

// ── Policies + claim ────────────────────────────────────────────────────────
function PoliciesCard({
  state,
  onChange,
}: {
  state: DeskState | null;
  onChange: () => Promise<void>;
}) {
  const gameById = React.useMemo(
    () => new Map((state?.games ?? []).map((g) => [g.gameId, g])),
    [state],
  );
  return (
    <section className="bg-card text-card-foreground flex flex-col gap-3 rounded-xl border p-5">
      <h2 className="font-semibold">Policies</h2>
      {!state ? (
        <p className="text-muted-foreground text-sm">…</p>
      ) : state.policies.length === 0 ? (
        <p className="text-muted-foreground text-sm">No policies bought yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {state.policies.map((p) => (
            <PolicyRow
              key={p.policyId}
              policy={p}
              game={gameById.get(p.gameId)}
              onChange={onChange}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PolicyRow({
  policy,
  game,
  onChange,
}: {
  policy: DeskPolicy;
  game: DeskGame | undefined;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const claimable = Boolean(game?.resolved && game?.blowout && !policy.claimed);

  const claim = React.useCallback(async () => {
    setErr(null);
    setBusy(true);
    try {
      await postDesk({ action: "claim", policyId: policy.policyId });
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Claim failed.");
    } finally {
      setBusy(false);
    }
  }, [policy.policyId, onChange]);

  return (
    <li className="flex items-center justify-between gap-2 border-t pt-3 first:border-t-0 first:pt-0 text-sm">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium tabular-nums">
          #{policy.policyId} · {usd(policy.payoutUsd)} payout
        </span>
        <span className="text-muted-foreground font-mono text-xs">{short(policy.holder)}</span>
      </div>
      <div className="flex flex-col items-end gap-1">
        {policy.claimed ? (
          <span className="text-emerald-600 text-xs font-medium">✓ paid</span>
        ) : claimable ? (
          <Button onClick={() => void claim()} disabled={busy} className="h-8">
            {busy ? "Paying…" : "Pay out"}
          </Button>
        ) : (
          <span className="text-muted-foreground text-xs">
            {game?.resolved ? "no blowout" : "awaiting result"}
          </span>
        )}
        {err && <p className="text-destructive text-xs">{err}</p>}
      </div>
    </li>
  );
}
