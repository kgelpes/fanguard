"use client";

import * as React from "react";
import {
  useAccount,
  useConfig,
  useSendTransaction,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { getPublicClient } from "wagmi/actions";

import {
  DEFAULT_PAYMENT_SOURCE,
  TERMINAL_EXECUTION_STATES,
  TERMINAL_SETTLEMENT_STATES,
  type PaymentSource,
} from "./config";
import type { EvmSigningPayload, FlowQuote, FlowStartResult, FlowStatusResult } from "./types";

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export type FlowPaymentStatus =
  | "idle"
  | "starting"
  | "awaiting_signature"
  | "broadcasting"
  | "settling"
  | "completed"
  | "failed"
  | "error";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function postFlow<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/flow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Flow request failed (${res.status}).`);
  }
  return data;
}

function isRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /reject|denied|cancell?ed|user (refused|declined)/i.test(message);
}

/**
 * Drives a Fireblocks Flow payment for the embedded wallet:
 *   start (server) → sign + broadcast (wallet) → broadcast notify (server) → poll.
 * The fan pays the premium from Polygon USDC; Flow settles USDC to our treasury.
 */
export function useFlowPayment() {
  const { address, chainId } = useAccount();
  const config = useConfig();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();

  const [status, setStatus] = React.useState<FlowPaymentStatus>("idle");
  const [quote, setQuote] = React.useState<FlowQuote | null>(null);
  const [txHash, setTxHash] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const reset = React.useCallback(() => {
    setStatus("idle");
    setQuote(null);
    setTxHash(null);
    setError(null);
  }, []);

  const pollUntilTerminal = React.useCallback(
    async (transactionId: string): Promise<FlowStatusResult> => {
      const MAX_ATTEMPTS = 40; // ~2 min at 3s
      let last: FlowStatusResult | null = null;
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        last = await postFlow<FlowStatusResult>({ action: "status", transactionId });
        if (
          TERMINAL_SETTLEMENT_STATES.includes(last.settlementState) ||
          TERMINAL_EXECUTION_STATES.includes(last.executionState)
        ) {
          return last;
        }
        await delay(3000);
      }
      return last ?? { executionState: "unknown", settlementState: "unknown", riskState: "unknown" };
    },
    [],
  );

  const signAndBroadcast = React.useCallback(
    async (payload: EvmSigningPayload): Promise<string> => {
      // Sign on whatever chain Flow's payload targets (the fan's source chain).
      const signChainId = Number(payload.chainId);

      // ERC-20 path: approve the spender first, then send the main tx.
      if (payload.evmApproval) {
        const approvalHash = await writeContractAsync({
          address: payload.evmApproval.tokenAddress as `0x${string}`,
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [
            payload.evmApproval.spenderAddress as `0x${string}`,
            BigInt(payload.evmApproval.amount),
          ],
          chainId: signChainId,
        });
        await getPublicClient(config, { chainId: signChainId })?.waitForTransactionReceipt({
          hash: approvalHash,
        });
      }

      return sendTransactionAsync({
        to: payload.evmTransaction.to as `0x${string}`,
        data: payload.evmTransaction.data as `0x${string}`,
        value: BigInt(payload.evmTransaction.value || "0"),
        chainId: signChainId,
      });
    },
    [config, sendTransactionAsync, writeContractAsync],
  );

  const pay = React.useCallback(
    async (
      amountUsd: number,
      source: PaymentSource = DEFAULT_PAYMENT_SOURCE,
      memo?: Record<string, unknown>,
    ) => {
      if (!address) {
        setError("Log in to spin up your wallet first.");
        setStatus("error");
        return;
      }

      setError(null);
      setTxHash(null);
      setStatus("starting");

      try {
        // Move the wallet to the source chain up front (fail fast if it's not
        // enabled in Dynamic) so it's ready to sign as soon as Flow quotes.
        if (chainId !== source.chainId) {
          await switchChainAsync({ chainId: source.chainId });
        }

        const start = await postFlow<FlowStartResult>({
          action: "start",
          amount: amountUsd.toFixed(2),
          fromAddress: address,
          fromChainId: String(source.chainId),
          fromChainName: source.chainName,
          fromTokenAddress: source.tokenAddress,
          memo,
        });
        setQuote(start.quote);

        setStatus("awaiting_signature");
        let hash: string;
        try {
          hash = await signAndBroadcast(start.signingPayload);
        } catch (signError) {
          // Best-effort cancel so the transaction isn't left dangling.
          await postFlow({
            action: "cancel",
            transactionId: start.transactionId,
            sessionToken: start.sessionToken,
          }).catch(() => {});
          setError(isRejection(signError) ? "Signature cancelled." : describe(signError));
          setStatus("error");
          return;
        }
        setTxHash(hash);

        setStatus("broadcasting");
        await postFlow({
          action: "broadcast",
          transactionId: start.transactionId,
          sessionToken: start.sessionToken,
          txHash: hash,
        });

        setStatus("settling");
        const final = await pollUntilTerminal(start.transactionId);
        if (final.settlementState === "completed") {
          setStatus("completed");
        } else {
          setError(`Settlement ${final.settlementState || final.executionState}.`);
          setStatus("failed");
        }
      } catch (err) {
        setError(describe(err));
        setStatus("error");
      }
    },
    [address, chainId, pollUntilTerminal, signAndBroadcast, switchChainAsync],
  );

  return { status, quote, txHash, error, pay, reset };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "Payment failed.";
}
