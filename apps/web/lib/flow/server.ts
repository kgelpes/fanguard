// Server-only Flow client. Imported solely by app/api/flow/route.ts, so the
// `dyn_` API token never reaches the browser bundle.
import { getAddress } from "viem";

import { env } from "~/env";
import {
  DEFAULT_SETTLEMENT_ADDRESS,
  FLOW_API_BASE,
  FLOW_CHAIN_NAME,
  POLYGON_CHAIN_ID,
  POLYGON_USDC,
  SETTLEMENT_TOKEN,
} from "./config";
import type { EvmSigningPayload, FlowQuote, FlowTransaction } from "./types";

/** Thrown when Flow env vars aren't set — surfaced to the client as a 501 with setup hints. */
export class FlowNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowNotConfiguredError";
  }
}

/** Thrown when a Flow API call returns a non-2xx; carries the upstream status + parsed message. */
export class FlowApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "FlowApiError";
  }
}

function environmentId(): string {
  return env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
}

function apiToken(): string {
  const token = env.DYNAMIC_API_TOKEN;
  if (!token) {
    throw new FlowNotConfiguredError(
      "DYNAMIC_API_TOKEN is not set. Create an environment API token (dyn_…) at " +
        "app.dynamic.xyz → Developers → API Tokens, with Fireblocks Flow enabled, " +
        "then add it to apps/web/.env.local.",
    );
  }
  return token;
}

/**
 * EIP-55 checksum an EVM address. Dynamic's Flow API 422s a mixed-case address
 * whose checksum doesn't verify, so we normalize every address before sending.
 * Throws a clear FlowApiError if the value isn't a valid address at all.
 */
function checksum(address: string, label: string): string {
  try {
    return getAddress(address);
  } catch {
    throw new FlowApiError(`Invalid EVM address for ${label}: ${address}`, 400);
  }
}

function settlementAddress(): string {
  return checksum(env.FLOW_SETTLEMENT_ADDRESS ?? DEFAULT_SETTLEMENT_ADDRESS, "settlement destination");
}

/** Single fetch wrapper: JSON in/out, throws FlowApiError on non-2xx with a useful message. */
async function flowFetch<T>(
  path: string,
  init: { method: string; headers?: Record<string, string>; body?: unknown },
): Promise<T> {
  const res = await fetch(`${FLOW_API_BASE}${path}`, {
    method: init.method,
    headers: { "Content-Type": "application/json", ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    // Flow is a payment API — never serve a cached response.
    cache: "no-store",
  });

  const text = await res.text();
  const parsed = text ? safeJson(text) : undefined;

  if (!res.ok) {
    // Dynamic returns the human-readable reason in `error` (and a machine code
    // in `code`); some endpoints use `message`. Stack extra detail from the
    // validation payload so the message is actionable, not just "(422)".
    const detail = extractError(parsed);
    const message = detail ?? `Flow API ${init.method} ${path} failed (${res.status})`;
    // Log the full upstream body server-side — invaluable for 4xx debugging.
    console.error(`[flow] ${init.method} ${path} → ${res.status}`, parsed ?? text);
    throw new FlowApiError(message, res.status, parsed);
  }

  return parsed as T;
}

function extractError(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const body = parsed as Record<string, unknown>;
  const base =
    (typeof body.error === "string" && body.error) ||
    (typeof body.message === "string" && body.message) ||
    undefined;
  const code = typeof body.code === "string" ? body.code : undefined;
  const extra = Array.isArray(
    (body.payload as { additionalMessages?: unknown } | undefined)?.additionalMessages,
  )
    ? ((body.payload as { additionalMessages: string[] }).additionalMessages.join("; "))
    : undefined;
  return [base, extra, code && `[${code}]`].filter(Boolean).join(" ") || undefined;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ── Step 1: Checkout (reusable config) ──────────────────────────────────────
// A checkout encodes "settle USDC.e on Polygon → our hedge wallet". It's static, so
// we create it once and cache the id for the life of the server process. Set
// FLOW_CHECKOUT_ID to reuse one created out-of-band (e.g. via curl) and skip creation.
let cachedCheckoutId: string | null = null;

export async function ensureCheckout(): Promise<string> {
  if (env.FLOW_CHECKOUT_ID) return env.FLOW_CHECKOUT_ID;
  if (cachedCheckoutId) return cachedCheckoutId;

  const checkout = await flowFetch<{ id: string }>(
    `/environments/${environmentId()}/checkouts`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken()}` },
      body: {
        mode: "payment",
        settlementConfig: {
          strategy: "cheapest",
          settlements: [
            {
              chainName: SETTLEMENT_TOKEN.chainName,
              chainId: SETTLEMENT_TOKEN.chainId,
              tokenAddress: checksum(SETTLEMENT_TOKEN.address, "settlement token"),
              symbol: SETTLEMENT_TOKEN.symbol,
              tokenDecimals: SETTLEMENT_TOKEN.decimals,
              isNative: SETTLEMENT_TOKEN.isNative,
            },
          ],
        },
        destinationConfig: {
          destinations: [
            { chainName: FLOW_CHAIN_NAME, type: "address", identifier: settlementAddress() },
          ],
        },
        enableOrchestration: true,
      },
    },
  );

  cachedCheckoutId = checkout.id;
  return checkout.id;
}

// ── Step 2: Create transaction ──────────────────────────────────────────────
export async function createTransaction(
  checkoutId: string,
  amount: string,
  memo?: Record<string, unknown>,
): Promise<{ sessionToken: string; transaction: FlowTransaction }> {
  return flowFetch(`/sdk/${environmentId()}/checkouts/${checkoutId}/transactions`, {
    method: "POST",
    body: { amount, currency: "USD", ...(memo ? { memo } : {}) },
  });
}

// ── Step 3: Attach source (the fan's wallet/chain) ──────────────────────────
export async function attachSource(
  transactionId: string,
  sessionToken: string,
  fromAddress: string,
  fromChainId: string,
  fromChainName: string,
): Promise<FlowTransaction> {
  return flowFetch(`/sdk/${environmentId()}/transactions/${transactionId}/source`, {
    method: "POST",
    headers: { "x-dynamic-checkout-session-token": sessionToken },
    body: {
      sourceType: "wallet",
      fromAddress: checksum(fromAddress, "source wallet"),
      fromChainId,
      fromChainName,
    },
  });
}

// ── Step 4: Quote (which token the fan pays with) ───────────────────────────
export async function getQuote(
  transactionId: string,
  sessionToken: string,
  fromTokenAddress: string,
): Promise<FlowTransaction> {
  return flowFetch(`/sdk/${environmentId()}/transactions/${transactionId}/quote`, {
    method: "POST",
    headers: { "x-dynamic-checkout-session-token": sessionToken },
    body: { fromTokenAddress: checksum(fromTokenAddress, "source token") },
  });
}

// ── Step 5: Prepare (lock the quote, get the signing payload) ────────────────
export async function prepare(
  transactionId: string,
  sessionToken: string,
): Promise<FlowTransaction> {
  return flowFetch(`/sdk/${environmentId()}/transactions/${transactionId}/prepare`, {
    method: "POST",
    headers: { "x-dynamic-checkout-session-token": sessionToken },
    body: { assertBalanceForGasCost: true, assertBalanceForTransferAmount: true },
  });
}

// ── Step 7: Notify backend of the broadcast tx hash ─────────────────────────
export async function notifyBroadcast(
  transactionId: string,
  sessionToken: string,
  txHash: string,
): Promise<FlowTransaction> {
  return flowFetch(`/sdk/${environmentId()}/transactions/${transactionId}/broadcast`, {
    method: "POST",
    headers: { "x-dynamic-checkout-session-token": sessionToken },
    body: { txHash },
  });
}

// ── Step 8: Poll status (no auth) ───────────────────────────────────────────
export async function getStatus(transactionId: string): Promise<FlowTransaction> {
  return flowFetch(`/sdk/${environmentId()}/transactions/${transactionId}`, { method: "GET" });
}

/** Cancel a transaction (e.g. the fan rejected the signature in their wallet). */
export async function cancelTransaction(
  transactionId: string,
  sessionToken: string,
): Promise<FlowTransaction> {
  return flowFetch(`/sdk/${environmentId()}/transactions/${transactionId}/cancel`, {
    method: "POST",
    headers: { "x-dynamic-checkout-session-token": sessionToken },
  });
}

/**
 * Step 5 with risk-screening retry. Attaching the source kicks off async
 * sanctions screening; `prepare` 422s with "risk" until it clears. We poll
 * status until riskState is "cleared", then prepare — capped so we never hang.
 */
export async function prepareWhenRiskClears(
  transactionId: string,
  sessionToken: string,
): Promise<FlowTransaction> {
  const MAX_ATTEMPTS = 8;
  const DELAY_MS = 1500;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await prepare(transactionId, sessionToken);
    } catch (error) {
      const isRisk =
        error instanceof FlowApiError &&
        error.status === 422 &&
        /risk/i.test(error.message);
      if (!isRisk || attempt === MAX_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }
  // Unreachable: the loop either returns or throws.
  throw new FlowApiError("Risk screening did not clear in time.", 422);
}

/**
 * Steps 1–5: ensure the checkout, open a transaction for `amountUsd`, attach the
 * fan's wallet as source, quote the conversion, and prepare the signing payload.
 * The client takes it from here (Step 6: sign + broadcast).
 */
export async function startPayment(params: {
  amount: string;
  fromAddress: string;
  fromChainId?: string;
  fromChainName?: string;
  fromTokenAddress?: string;
  memo?: Record<string, unknown>;
}): Promise<{
  transactionId: string;
  sessionToken: string;
  quote: FlowQuote;
  signingPayload: EvmSigningPayload;
}> {
  const checkoutId = await ensureCheckout();
  const { sessionToken, transaction } = await createTransaction(
    checkoutId,
    params.amount,
    params.memo,
  );

  await attachSource(
    transaction.id,
    sessionToken,
    params.fromAddress,
    params.fromChainId ?? POLYGON_CHAIN_ID,
    params.fromChainName ?? FLOW_CHAIN_NAME,
  );
  const quoted = await getQuote(transaction.id, sessionToken, params.fromTokenAddress ?? POLYGON_USDC);
  const prepared = await prepareWhenRiskClears(transaction.id, sessionToken);

  const signingPayload = prepared.quote?.signingPayload;
  if (!signingPayload?.evmTransaction) {
    throw new FlowApiError("Flow did not return an EVM signing payload.", 502, prepared);
  }

  // Quote amounts/fees come from Step 4; the signing payload comes from Step 5.
  const q = quoted.quote ?? prepared.quote;
  return {
    transactionId: transaction.id,
    sessionToken,
    quote: {
      version: q?.version ?? prepared.quoteVersion,
      fromAmount: q?.fromAmount ?? params.amount,
      toAmount: q?.toAmount ?? params.amount,
      estimatedTimeSec: q?.estimatedTimeSec,
      fees: q?.fees,
      expiresAt: q?.expiresAt,
    },
    signingPayload,
  };
}
