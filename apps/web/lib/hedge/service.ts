import "server-only";

import {
  createClobClient,
  formatUnits6,
  getClients,
  makeRelayClient,
  placeLimitOrder,
  PUSD,
  resolveFixture,
  Side,
  SignatureTypeV2,
  USDC_E,
  wrapToPusd,
} from "@fanguard/polymarket";
import { quoteCover } from "@fanguard/pricing";
import { erc20Abi } from "viem";

import { env } from "~/env";

/**
 * Server-side hedge desk. Drives the Polymarket leg the fan never sees: derive
 * the deposit wallet, resolve the blowout combo, and place the offsetting order.
 * Mirrors `packages/polymarket/scripts/place-order.ts`, exposed to the web app.
 *
 * The key + relayer + CLOB are Node-only and the order POST is geofenced, so
 * this can only run in the server route — never the browser.
 */

/** Polymarket's minimum on a marketable buy's `size × price`. */
const MIN_ORDER_USD = 1;
/** How far above the best ask we price a marketable limit, to cross the spread. */
const CROSS_SPREAD_TICK = 0.02;
/** Cap the limit price just below 1 (a YES share can't be worth more than $1). */
const MAX_LIMIT_PRICE = 0.99;

const round2 = (n: number) => Math.round(n * 100) / 100;

export class HedgeNotConfiguredError extends Error {
  constructor() {
    super("HEDGE_PRIVATE_KEY is not set — fund a deposit wallet and add the key to apps/web/.env.");
    this.name = "HedgeNotConfiguredError";
  }
}

function privateKey(): `0x${string}` {
  const key = env.HEDGE_PRIVATE_KEY;
  if (!key) throw new HedgeNotConfiguredError();
  return (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
}

function rpcUrl(): string | undefined {
  return env.POLYGON_RPC_URL || undefined;
}

async function depositWalletPusd(depositWallet: string): Promise<bigint> {
  const { publicClient } = getClients(privateKey(), rpcUrl());
  return publicClient.readContract({
    address: PUSD,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [depositWallet as `0x${string}`],
  });
}

export interface HedgeStatus {
  depositWallet: string;
  /** pUSD buying power held by the deposit wallet, human-readable. */
  buyingPower: string;
  buyingPowerRaw: string;
}

/** Read the hedge wallet's address and current pUSD buying power. */
export async function getHedgeStatus(): Promise<HedgeStatus> {
  const { relay } = makeRelayClient(privateKey(), rpcUrl());
  const depositWallet = await relay.deriveDepositWalletAddress();
  const pusd = await depositWalletPusd(depositWallet);
  return {
    depositWallet,
    buyingPower: formatUnits6(pusd),
    buyingPowerRaw: pusd.toString(),
  };
}

export interface FundingResult {
  /** USDC.e wrapped into pUSD, human-readable. */
  wrapped: string;
  /** pUSD moved EOA → deposit wallet, human-readable. */
  moved: string;
}

/**
 * Sweep whatever the premium just settled into hedge buying power: wrap any
 * USDC.e in the EOA → pUSD, then move all pUSD → the deposit wallet. This is the
 * "it just handles it" step — the fan's deposit (any token, routed to USDC.e by
 * Flow) becomes the desk's collateral with no manual handling. No-op if empty.
 */
async function fundDepositWalletFromEoa(depositWallet: string): Promise<FundingResult> {
  const clients = getClients(privateKey(), rpcUrl());
  const { account, publicClient, walletClient } = clients;
  const eoa = account.address;

  const usdce = (await publicClient.readContract({
    address: USDC_E,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [eoa],
  })) as bigint;
  let wrapped = 0n;
  if (usdce > 0n) {
    await wrapToPusd(clients, usdce);
    wrapped = usdce;
  }

  const pusd = (await publicClient.readContract({
    address: PUSD,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [eoa],
  })) as bigint;
  let moved = 0n;
  if (pusd > 0n) {
    const hash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: PUSD,
      abi: erc20Abi,
      functionName: "transfer",
      args: [depositWallet as `0x${string}`, pusd],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    moved = pusd;
  }

  return { wrapped: formatUnits6(wrapped), moved: formatUnits6(moved) };
}

export interface PlaceHedgeInput {
  /** Fixture string, e.g. "Brazil vs Morocco". */
  matchup: string;
  /** The team the fan came for; the hedge covers them getting blown out. */
  myTeam: string;
  /** Stack the opponent-shutout leg onto the combo. */
  shutout?: boolean;
  /** Target spend in USD for this hedge (capped to buying power). Default 0.9. */
  notionalUsd?: number;
  /** Sweep settled premium (EOA USDC.e/pUSD) into the deposit wallet first. Default true. */
  autoFund?: boolean;
}

export interface PlaceHedgeResult {
  event: { title: string; slug: string };
  /** Plain-English description of what the hedge bets on (the blowout). */
  legSelection: string;
  tokenId: string;
  depositWallet: string;
  /** Best ask seen on the book when ordering. */
  bestAsk: number | null;
  limitPrice: number;
  shares: number;
  /** Estimated cost in USD (shares × fill price). */
  estCostUsd: number;
  orderId: string | null;
  status: string;
  success: boolean;
  txHashes: string[];
  /** What the auto-fund step swept into the deposit wallet before ordering. */
  funding: FundingResult;
}

/**
 * Place the offsetting hedge for a fan covering `myTeam`. The trigger combo is
 * the OPPONENT running away with it (what ruins the fan's night), so we buy that
 * combo's deepest spread leg.
 */
export async function placeHedge(input: PlaceHedgeInput): Promise<PlaceHedgeResult> {
  const notionalUsd = input.notionalUsd ?? 0.9;

  // 1. Resolve the fixture → the trigger combo for this fan.
  const resolution = await resolveFixture(input.matchup, { includeShutoutLeg: input.shutout });
  const quote = quoteCover({ combos: resolution.combos, myTeam: input.myTeam });
  const leg = quote.triggerCombo?.legs[0];
  if (!leg?.tokenId) {
    throw new Error(`No blowout line to hedge ${input.myTeam} on "${resolution.event.title}".`);
  }
  const tokenId = leg.tokenId;

  // 2. Connect via the deposit wallet (POLY_1271).
  const { relay } = makeRelayClient(privateKey(), rpcUrl());
  const depositWallet = await relay.deriveDepositWalletAddress();
  const { client } = await createClobClient({
    privateKey: privateKey(),
    rpcUrl: rpcUrl(),
    signatureType: SignatureTypeV2.POLY_1271,
    funderAddress: depositWallet,
  });

  // 2b. Sweep the just-settled premium into the deposit wallet (the handoff).
  const funding =
    input.autoFund === false
      ? { wrapped: "0", moved: "0" }
      : await fundDepositWalletFromEoa(depositWallet);

  // 3. Size from the book + available buying power. Polymarket enforces a $1
  // minimum on a marketable buy's `size × price`, and reserves at the limit
  // price, so buying power must cover `shares × limitPrice`.
  const book = await client.getOrderBook(tokenId).catch(() => null);
  const bestAsk = book?.asks?.at(-1)?.price ? Number(book.asks.at(-1)!.price) : null;
  const askForSizing = bestAsk ?? Math.min(0.95, leg.probability);
  // Marketable limit: cross the spread (one tick above the ask), capped just below 1.
  const limitPrice = Math.min(MAX_LIMIT_PRICE, round2(askForSizing + CROSS_SPREAD_TICK));
  const available = Number(await depositWalletPusd(depositWallet)) / 1e6;

  const minShares = Math.ceil(MIN_ORDER_USD / limitPrice);
  const targetShares = Math.floor(Math.max(notionalUsd, MIN_ORDER_USD) / limitPrice);
  const shares = Math.max(minShares, targetShares);
  const reserve = shares * limitPrice;
  if (reserve > available) {
    throw new Error(
      `Insufficient buying power: need ≥ $${reserve.toFixed(2)} (Polymarket min $1 on size×price), ` +
        `deposit wallet has $${available.toFixed(2)}. Top up the deposit wallet.`,
    );
  }

  // 4. Post the order.
  const res = (await placeLimitOrder(client, {
    tokenID: tokenId,
    price: limitPrice,
    size: shares,
    side: Side.BUY,
  })) as {
    orderID?: string;
    status?: string | number;
    success?: boolean;
    transactionsHashes?: string[];
    errorMsg?: string;
    error?: string;
  };

  if (res.errorMsg || res.error || res.success === false) {
    throw new Error(res.errorMsg || res.error || `Order rejected (status ${res.status}).`);
  }

  return {
    event: { title: resolution.event.title, slug: resolution.event.slug },
    legSelection: leg.selection,
    tokenId,
    depositWallet,
    bestAsk,
    limitPrice,
    shares,
    estCostUsd: Math.round(shares * askForSizing * 100) / 100,
    orderId: res.orderID ?? null,
    status: String(res.status ?? "unknown"),
    success: Boolean(res.success),
    txHashes: res.transactionsHashes ?? [],
    funding,
  };
}
