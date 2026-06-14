// Names the FanGuard settler agent on ENS with ENSIP-26 agent records, so the
// autonomous agent that resolves games and auto-pays blowout claims has a
// persistent, human-readable, discoverable identity — `settler.<parent>.eth`.
// Gasless via NameStone's offchain resolver (same plumbing as per-policy certs).
//
// Run once after enabling your domain in NameStone:
//   node --env-file=apps/web/.env.local apps/web/scripts/register-agent-ens.mjs
//
// Env:
//   NAMESTONE_API_KEY              (required) NameStone key
//   NEXT_PUBLIC_ENS_PARENT_DOMAIN  (required) e.g. fanguard.eth
//   AGENT_ENS_LABEL                (optional) subname label, default "settler"
//   AGENT_ENS_ADDRESS              (optional) settler wallet the name resolves to
//   NEXT_PUBLIC_APP_URL            (optional) used for endpoint/avatar/url
//   NEXT_PUBLIC_ENS_NETWORK        (optional) "mainnet" | "sepolia" (link only)

const apiKey = process.env.NAMESTONE_API_KEY;
const domain = process.env.NEXT_PUBLIC_ENS_PARENT_DOMAIN?.trim().toLowerCase();
const label = (process.env.AGENT_ENS_LABEL ?? "settler").trim().toLowerCase();
const address = process.env.AGENT_ENS_ADDRESS?.trim();
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://fanguard.app";
const network = process.env.NEXT_PUBLIC_ENS_NETWORK === "sepolia" ? "sepolia" : "mainnet";

if (!apiKey || !domain) {
  console.error(
    "Missing config: set NAMESTONE_API_KEY and NEXT_PUBLIC_ENS_PARENT_DOMAIN (the domain you enabled in NameStone).",
  );
  process.exit(1);
}

const name = `${label}.${domain}`;

// ENSIP-26: `agent-context` (how to interact) + `agent-endpoint[<protocol>]`.
const textRecords = {
  "agent-context": [
    "# FanGuard Settler Agent",
    "",
    "An autonomous agent that underwrites and settles FanGuard blowout cover.",
    "It opens games on the CoverPool vault (Polygon), reads each fixture's final",
    "margin, and auto-pays the policyholder when their team gets blown out — before",
    "the fan even leaves the stadium. Every policy it writes is issued a verifiable",
    `ENS certificate-of-cover subname under ${domain}.`,
    "",
    "Capabilities: open-game, sign-policy-quote, resolve-result, auto-claim-payout.",
  ].join("\n"),
  "agent-endpoint[web]": `${appUrl}/desk`,
  description:
    "Autonomous underwriter + settler for FanGuard blowout cover (Polygon + Polymarket-hedged).",
  url: `${appUrl}/desk`,
  avatar: `${appUrl}/fanguard-shield.png`,
};

const body = { domain, name: label, text_records: textRecords };
if (address) body.address = address;

const res = await fetch("https://namestone.com/api/public_v1/set-name", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: apiKey },
  body: JSON.stringify(body),
});

if (!res.ok) {
  console.error(`NameStone set-name failed (${res.status}): ${await res.text().catch(() => "")}`);
  process.exit(1);
}

const host = network === "sepolia" ? "sepolia.app.ens.domains" : "app.ens.domains";
console.log(`✅ Agent identity live: ${name}`);
console.log(`   Profile: https://${host}/${name}`);
console.log(`   ENSIP-26 records: agent-context, agent-endpoint[web]`);
