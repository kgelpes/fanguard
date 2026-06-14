import { createSign, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { env } from "~/env";

// Blink signing needs Node `crypto` (ECDSA P-256) — Edge runtimes will not work.
export const runtime = "nodejs";
// Dublin, consistent with the other checkout routes — keeps server-side checkout
// traffic out of US regions (Vercel defaults to iad1). See vercel.json.
export const preferredRegion = "dub1";

// FanGuard only deposits USDC on Polygon, so we enforce EVM addresses here. (Blink
// also supports Solana Base58; a Solana build would relax this per the docs.)
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface SignerRequest {
  amount: number;
  chainId: number;
  address: string;
  token: string;
  callbackScheme: string | null;
  // Sent by the SDK; `url`/`version` are echoed, the rest is reconciliation data
  // the SDK forwards to the hosted flow (not part of the signed payload).
  url?: string;
  version?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
}

function validate(body: Partial<SignerRequest>): string[] {
  const errors: string[] = [];
  if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0) {
    errors.push("amount must be a positive number.");
  }
  if (!Number.isInteger(body.chainId) || (body.chainId as number) <= 0) {
    errors.push("chainId must be a positive integer.");
  }
  if (typeof body.address !== "string" || !EVM_ADDRESS.test(body.address)) {
    errors.push("address must be a 0x-prefixed, 40-character hex address.");
  }
  if (typeof body.token !== "string" || !EVM_ADDRESS.test(body.token)) {
    errors.push("token must be a 0x-prefixed, 40-character hex address.");
  }
  // Web SDK only: it sends `callbackScheme: null`. A mobile build would allowlist
  // its own URL scheme(s) here instead.
  if (body.callbackScheme !== null && body.callbackScheme !== undefined) {
    errors.push("callbackScheme must be null for the web SDK.");
  }
  return errors;
}

/**
 * POST /api/sign-payment — Blink merchant signer.
 *
 * The web Deposit SDK POSTs a deposit request here; we validate it, build the
 * canonical payload (exact field order matters — it's the signed message),
 * base64url-encode it, and sign the ENCODED STRING with ECDSA P-256 + SHA-256.
 * The hosted flow verifies the signature against our registered public key.
 *
 * The private key never leaves the server and is never logged. See the Blink
 * production checklist for the hardening still owed before going live
 * (session/bearer auth, rate limiting, secrets manager, destination-ownership
 * checks). For the demo we ship a same-origin guard only.
 */
export async function POST(request: Request) {
  // "Strict CORS" guard from the Blink checklist: the signer is only ever called
  // by our own checkout. Browser requests carry an Origin; a mismatch is rejected.
  // (Server-to-server smoke tests send no Origin and pass.)
  const origin = request.headers.get("origin");
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  if (origin && appUrl && new URL(appUrl).origin !== origin) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed.", code: "FORBIDDEN_ORIGIN" },
      { status: 403 },
    );
  }

  const merchantId = env.NEXT_PUBLIC_BLINK_MERCHANT_ID;
  // The env value is a single line with literal `\n`; restore real newlines for
  // the PEM parser.
  const privateKeyPem = env.BLINK_MERCHANT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!merchantId || !privateKeyPem) {
    return NextResponse.json(
      {
        error:
          "Blink signer is not configured. Set NEXT_PUBLIC_BLINK_MERCHANT_ID and BLINK_MERCHANT_PRIVATE_KEY.",
        code: "BLINK_NOT_CONFIGURED",
      },
      { status: 501 },
    );
  }

  let body: SignerRequest;
  try {
    body = (await request.json()) as SignerRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const errors = validate(body);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" "), code: "BAD_REQUEST" }, { status: 400 });
  }

  const { amount, chainId, address, token } = body;
  const callbackScheme = body.callbackScheme ?? null;
  const version = body.version && body.version.length > 0 ? body.version : "v1";

  const idempotencyKey = randomUUID();
  const signatureTimestamp = new Date().toISOString();

  // Field ORDER is part of the signed message — it must match Blink's spec
  // exactly. Do not reorder or add fields.
  const payloadObject = {
    amount,
    chainId,
    address,
    token,
    idempotencyKey,
    callbackScheme,
    signatureTimestamp,
    version,
  };

  const payload = Buffer.from(JSON.stringify(payloadObject), "utf8").toString("base64url");

  // Sign the base64url STRING (its ASCII bytes), NOT the raw JSON. DER signature,
  // base64url-encoded.
  let signature: string;
  try {
    const signer = createSign("SHA256");
    signer.update(payload);
    signer.end();
    signature = signer.sign(privateKeyPem).toString("base64url");
  } catch (err) {
    console.error("[/api/sign-payment] signing failed", err);
    return NextResponse.json(
      { error: "Failed to sign payload.", code: "SIGNING_FAILED" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      merchantId,
      payload,
      signature,
      preview: { amount, chainId, address, token, idempotencyKey },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
