# ENS certificate-of-cover

Every FanGuard policy becomes a **resolvable ENS subname** whose text records hold
the cover terms — a portable, publicly verifiable certificate-of-cover. Minted
**gaslessly, server-side, right after `buyPolicy` confirms**, so the fan never
signs or pays for it (crypto stays offstage).

```
policy-42.fanguard.eth
  ├─ description          "FanGuard cover · Knicks vs Celtics — pays $260 if Knicks lose by 6+…"
  ├─ url / avatar         link to the desk + the shield
  ├─ fanguard.matchup     "Knicks vs Celtics"
  ├─ fanguard.team        "Knicks"
  ├─ fanguard.threshold   "6"
  ├─ fanguard.payout-usd  "260.00"
  ├─ fanguard.premium-usd "12.00"
  ├─ fanguard.policy-id   "42"
  ├─ fanguard.tx          "0x…"        ← on-chain proof
  └─ fanguard.status      "active"
addr → the policyholder's wallet
```

## How it works

We use **NameStone**'s gasless offchain-subname API. NameStone runs an ENSIP-10
CCIP-Read resolver on the parent name, so a single `set-name` POST makes the
subname + records resolve on mainnet (or Sepolia) **with no transaction**.

- `lib/ens/config.ts` — client-safe helpers (name building, profile links).
- `lib/ens/certificate.ts` — server-only NameStone client (`issueCoverCertificate`).
- `app/api/cover-certificate/route.ts` — POST endpoint; the NameStone key never
  leaves the server. Returns `501` (and the checkout simply skips the step) when
  unconfigured.
- `lib/cover-pool/use-buy-policy.ts` — calls the route after the mint confirms
  with the **real** `policyId`; the resolvable name shows on the receipt.

It's **best-effort**: if NameStone is down or unconfigured, the cover is still
secured on-chain — the certificate just doesn't appear.

## Setup (≈2 minutes — required for a live demo)

1. **Get a parent name.** Register one on [app.ens.domains](https://app.ens.domains)
   (mainnet) or [sepolia.app.ens.domains](https://sepolia.app.ens.domains) (free,
   testnet — use a faucet). Sepolia is fine for the demo.
2. **Claim it in NameStone.** Go to [namestone.com](https://namestone.com), get a
   free API key, and add/enable your domain (this sets NameStone as the name's
   resolver — one gasless step in their dashboard).
3. **Set env** (`apps/web/.env.local`, and Vercel):
   ```
   NAMESTONE_API_KEY=...
   NEXT_PUBLIC_ENS_PARENT_DOMAIN=fanguard.eth      # the name you enabled
   NEXT_PUBLIC_ENS_NETWORK=mainnet                 # or sepolia
   ```
4. **(AI-agent prize) Name the settler agent** with ENSIP-26 records:
   ```
   node --env-file=apps/web/.env.local apps/web/scripts/register-agent-ens.mjs
   ```
   → `settler.fanguard.eth` with `agent-context` + `agent-endpoint[web]`.

## Why this qualifies (ENS @ ETHGlobal)

- **Functional, no hard-coded values** — the subname + records are built at
  runtime from the real minted `policyId` and cover economics.
- **Integrate / Most Creative** — ENS as a _verifiable credential_ store: the
  cover terms live on-chain-resolvable, the name resolves to the policyholder.
- **Best ENS Integration for AI Agents** — the FanGuard settler agent gets a
  named, discoverable identity via ENSIP-26 (`register-agent-ens.mjs`).
