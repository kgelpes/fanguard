// Shapes returned by the Fireblocks Flow checkout API that we actually read.
// Trimmed to what the payment flow needs — the API returns more fields.

/** Structured failure detail Flow records on a transaction when an op fails. */
export interface FlowFailure {
  code?: string;
  /** Human-readable reason — the most useful thing to show the fan. */
  message?: string;
  category?: string;
  /** Which axis failed, e.g. "execution" or "settlement". */
  stage?: string;
  retryable?: boolean;
}

export interface FlowFees {
  totalFeeUsd?: string;
  gasEstimate?: {
    usdValue?: string;
    nativeValue?: string;
    nativeSymbol?: string;
  };
}

export interface FlowQuote {
  version: number;
  /** What the payer's wallet is charged, in the source token. */
  fromAmount: string;
  /** What lands at the destination after swap + fees (the premium, in USDC). */
  toAmount: string;
  estimatedTimeSec?: number;
  fees?: FlowFees;
  expiresAt?: string;
}

/** EVM signing payload from Step 5 (prepare). `evmApproval` is present only when a spender must pull tokens. */
export interface EvmSigningPayload {
  chainName: string;
  chainId: string;
  evmTransaction: { to: string; data: string; value: string; gasLimit?: string };
  evmApproval?: { tokenAddress: string; spenderAddress: string; amount: string };
}

export interface FlowTransaction {
  id: string;
  checkoutId: string;
  amount: string;
  currency: string;
  executionState: string;
  settlementState: string;
  riskState: string;
  quoteVersion: number;
  quote?: (Partial<FlowQuote> & { signingPayload?: EvmSigningPayload }) | null;
  failure?: FlowFailure | null;
}

/** What the server's `start` action hands back to the client so it can sign. */
export interface FlowStartResult {
  transactionId: string;
  sessionToken: string;
  quote: FlowQuote;
  signingPayload: EvmSigningPayload;
}

/** Terminal-ish status the client polls for after broadcast. */
export interface FlowStatusResult {
  executionState: string;
  settlementState: string;
  riskState: string;
  failure?: FlowFailure | null;
}
