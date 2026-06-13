import { config } from "dotenv";

config();

/** Read a required env var or exit with a clear message. */
export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

export function privateKey(): `0x${string}` {
  const key = required("PRIVATE_KEY");
  const normalized = key.startsWith("0x") ? key : `0x${key}`;
  return normalized as `0x${string}`;
}

export function rpcUrl(): string | undefined {
  return process.env.POLYGON_RPC_URL || undefined;
}

/** Minimal `--flag value` / `--flag` parser. */
export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}
