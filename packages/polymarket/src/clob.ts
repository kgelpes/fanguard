import {
  Chain,
  ClobClient,
  OrderType,
  Side,
  SignatureTypeV2,
  type ApiKeyCreds,
} from "@polymarket/clob-client-v2";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { DEFAULT_POLYGON_RPC } from "./onchain";

/**
 * Order-placement layer over Polymarket's CLOB (V2 SDK).
 *
 * The CLOB itself is off-chain: orders are EIP-712 signed by the trader's
 * wallet and posted over HTTP; matching/settlement happens on the V2 exchange
 * contracts. On-chain prerequisites (pUSD balance + approvals) are handled in
 * {@link "./onchain"}. See `reference-polymarket-v2-pusd` for why pUSD/V2.
 */

export const CLOB_HOST = "https://clob.polymarket.com";

export { Side, OrderType, SignatureTypeV2 };
export type { ApiKeyCreds };

export interface CreateClobClientOptions {
  privateKey: `0x${string}`;
  rpcUrl?: string;
  /**
   * How orders are signed. `EOA` (default) trades directly from the key's own
   * address. Use `POLY_PROXY`/`POLY_GNOSIS_SAFE` with `funderAddress` set to a
   * pre-funded Polymarket profile address.
   */
  signatureType?: SignatureTypeV2;
  /** Address holding the collateral. Defaults to the EOA's own address. */
  funderAddress?: string;
  /** Reuse previously derived API credentials instead of deriving again. */
  creds?: ApiKeyCreds;
}

export interface ClobSession {
  client: ClobClient;
  creds: ApiKeyCreds;
  /** The EOA that signs orders. */
  address: string;
  /** The address whose collateral funds the orders. */
  funderAddress: string;
}

/**
 * Build an authenticated CLOB client. Derives (or reuses) the L2 API key the
 * CLOB requires, then returns a client ready to place orders.
 */
export async function createClobClient(options: CreateClobClientOptions): Promise<ClobSession> {
  const account = privateKeyToAccount(options.privateKey);
  const signer = createWalletClient({
    account,
    chain: polygon,
    transport: http(options.rpcUrl ?? DEFAULT_POLYGON_RPC),
  });

  const creds =
    options.creds ??
    (await new ClobClient({ host: CLOB_HOST, chain: Chain.POLYGON, signer }).createOrDeriveApiKey());

  const funderAddress = options.funderAddress ?? account.address;
  const client = new ClobClient({
    host: CLOB_HOST,
    chain: Chain.POLYGON,
    signer,
    creds,
    signatureType: options.signatureType ?? SignatureTypeV2.EOA,
    funderAddress,
  });

  return { client, creds, address: account.address, funderAddress };
}

export interface LimitOrderInput {
  /** CLOB token id of the outcome to trade (from a combo leg's `tokenId`). */
  tokenID: string;
  /** Limit price in [0,1], i.e. probability/share. */
  price: number;
  /** Number of outcome shares. Notional ≈ price × size (USD). */
  size: number;
  side?: Side;
}

/**
 * Place a Good-Till-Cancelled limit order. tickSize and negRisk are resolved
 * from the market automatically when omitted.
 */
export async function placeLimitOrder(client: ClobClient, input: LimitOrderInput) {
  return client.createAndPostOrder(
    {
      tokenID: input.tokenID,
      price: input.price,
      size: input.size,
      side: input.side ?? Side.BUY,
    },
    undefined,
    OrderType.GTC,
  );
}

export interface MarketOrderInput {
  tokenID: string;
  /** BUY: USD amount to spend. SELL: shares to sell. */
  amount: number;
  side?: Side;
}

/** Place a Fill-Or-Kill market order (price taken from the book). */
export async function placeMarketOrder(client: ClobClient, input: MarketOrderInput) {
  return client.createAndPostMarketOrder(
    {
      tokenID: input.tokenID,
      amount: input.amount,
      side: input.side ?? Side.BUY,
    },
    undefined,
    OrderType.FOK,
  );
}
