import { NextResponse } from "next/server";

import {
  cancelTransaction,
  FlowApiError,
  FlowNotConfiguredError,
  getStatus,
  notifyBroadcast,
  startPayment,
} from "~/lib/flow/server";

// Pin to Dublin (Ireland), consistent with the Polymarket routes — keeps all
// server-side checkout traffic out of US regions (Vercel defaults to iad1).
// See vercel.json for the project-wide default.
export const preferredRegion = "dub1";

/**
 * POST /api/flow — server-side proxy for the Fireblocks Flow checkout API.
 *
 * Keeps the `dyn_` API token off the client and dispatches by `action`:
 *   - "start":     ensure checkout → create tx → attach source → quote → prepare.
 *                  Returns { transactionId, sessionToken, quote, signingPayload }.
 *   - "broadcast": notify Dynamic of the on-chain txHash so it watches settlement.
 *   - "status":    poll execution/settlement state (no auth).
 *   - "cancel":    cancel a transaction (e.g. the fan rejected the signature).
 *
 * The fan signs Step 6 in their wallet (client-side, via wagmi) between
 * "start" and "broadcast". The session token round-trips to the client because
 * it authorizes only this one transaction — not the account.
 */
export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const action = payload.action;

  try {
    switch (action) {
      case "start": {
        const amount = asString(payload.amount);
        const fromAddress = asString(payload.fromAddress);
        if (!amount || !fromAddress) {
          return badRequest("`amount` and `fromAddress` are required for `start`.");
        }
        const result = await startPayment({
          amount,
          fromAddress,
          fromChainId: asString(payload.fromChainId) || undefined,
          fromChainName: asString(payload.fromChainName) || undefined,
          fromTokenAddress: asString(payload.fromTokenAddress) || undefined,
          memo: isRecord(payload.memo) ? payload.memo : undefined,
        });
        return NextResponse.json(result);
      }

      case "broadcast": {
        const transactionId = asString(payload.transactionId);
        const sessionToken = asString(payload.sessionToken);
        const txHash = asString(payload.txHash);
        if (!transactionId || !sessionToken || !txHash) {
          return badRequest("`transactionId`, `sessionToken`, and `txHash` are required.");
        }
        const tx = await notifyBroadcast(transactionId, sessionToken, txHash);
        return NextResponse.json({
          executionState: tx.executionState,
          settlementState: tx.settlementState,
          riskState: tx.riskState,
        });
      }

      case "status": {
        const transactionId = asString(payload.transactionId);
        if (!transactionId) return badRequest("`transactionId` is required for `status`.");
        const tx = await getStatus(transactionId);
        return NextResponse.json({
          executionState: tx.executionState,
          settlementState: tx.settlementState,
          riskState: tx.riskState,
        });
      }

      case "cancel": {
        const transactionId = asString(payload.transactionId);
        const sessionToken = asString(payload.sessionToken);
        if (!transactionId || !sessionToken) {
          return badRequest("`transactionId` and `sessionToken` are required for `cancel`.");
        }
        const tx = await cancelTransaction(transactionId, sessionToken);
        return NextResponse.json({ executionState: tx.executionState });
      }

      default:
        return badRequest(`Unknown action: ${String(action)}`);
    }
  } catch (error) {
    if (error instanceof FlowNotConfiguredError) {
      // 501 Not Implemented — Flow isn't wired up in this environment yet.
      return NextResponse.json({ error: error.message, code: "FLOW_NOT_CONFIGURED" }, { status: 501 });
    }
    if (error instanceof FlowApiError) {
      return NextResponse.json(
        { error: error.message, code: "FLOW_API_ERROR" },
        { status: error.status >= 400 && error.status < 600 ? error.status : 502 },
      );
    }
    console.error("[/api/flow] unexpected error", error);
    return NextResponse.json(
      { error: "Unexpected error talking to Flow.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function badRequest(message: string) {
  return NextResponse.json({ error: message, code: "BAD_REQUEST" }, { status: 400 });
}
