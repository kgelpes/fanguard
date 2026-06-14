// Minimal CoverPool ABI — only the surface the web app + settler touch. Mirrors
// packages/contracts/src/CoverPool.sol. Kept hand-written (not generated) so the
// app has no Foundry build dependency; keep in sync if the contract changes.
export const coverPoolAbi = [
  // ── Views ────────────────────────────────────────────────────────────────
  {
    type: "function",
    name: "settler",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "collateral",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "freeAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "lockedExposure",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalShares",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "sharesOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "games",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "opened", type: "bool" },
      { name: "resolved", type: "bool" },
      { name: "blowout", type: "bool" },
      { name: "threshold", type: "uint256" },
      { name: "exposureCap", type: "uint256" },
      { name: "totalPayout", type: "uint256" },
      { name: "margin", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "policies",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "holder", type: "address" },
      { name: "gameId", type: "uint256" },
      { name: "payout", type: "uint256" },
      { name: "claimed", type: "bool" },
    ],
  },
  // ── LP: deposit / withdraw ─────────────────────────────────────────────────
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "assets", type: "uint256" }],
  },
  // ── Settler lifecycle ──────────────────────────────────────────────────────
  {
    type: "function",
    name: "openGame",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "threshold", type: "uint256" },
      { name: "exposureCap", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "margin", type: "uint256" },
    ],
    outputs: [],
  },
  // ── Fan: buy + claim ─────────────────────────────────────────────────────
  {
    type: "function",
    name: "buyPolicy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "payout", type: "uint256" },
      { name: "premium", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "sig", type: "bytes" },
    ],
    outputs: [{ name: "policyId", type: "uint256" }],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "policyId", type: "uint256" }],
    outputs: [],
  },
  // ── Events ───────────────────────────────────────────────────────────────
  {
    type: "event",
    name: "GameOpened",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "threshold", type: "uint256", indexed: false },
      { name: "exposureCap", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PolicyBought",
    inputs: [
      { name: "policyId", type: "uint256", indexed: true },
      { name: "gameId", type: "uint256", indexed: true },
      { name: "holder", type: "address", indexed: true },
      { name: "payout", type: "uint256", indexed: false },
      { name: "premium", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "GameResolved",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "margin", type: "uint256", indexed: false },
      { name: "blowout", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      { name: "policyId", type: "uint256", indexed: true },
      { name: "holder", type: "address", indexed: true },
      { name: "payout", type: "uint256", indexed: false },
    ],
  },
  // ── Errors (so viem can decode reverts) ──────────────────────────────────
  { type: "error", name: "NotSettler", inputs: [] },
  { type: "error", name: "GameExists", inputs: [] },
  { type: "error", name: "GameNotOpen", inputs: [] },
  { type: "error", name: "GameResolvedAlready", inputs: [] },
  { type: "error", name: "ExposureCapExceeded", inputs: [] },
  { type: "error", name: "InsufficientFreeAssets", inputs: [] },
  { type: "error", name: "Expired", inputs: [] },
  { type: "error", name: "BadNonce", inputs: [] },
  { type: "error", name: "InvalidSignature", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
] as const;
