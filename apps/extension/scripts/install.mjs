#!/usr/bin/env node
// Build (or watch) the Fanguard extension against a chosen API base, then help
// you load it unpacked. The mode only changes which Fanguard API the bundled
// background worker talks to:
//
//   prod  → https://www.fanguard.app   (Vercel; Dublin region, dodges the geofence)
//   dev   → http://localhost:3000      (your local `pnpm --filter @fanguard/web dev`)
//
// Usage:
//   node scripts/install.mjs [prod|dev] [--firefox] [--zip] [--watch] [--url=<base>]
//   pnpm install:prod   |   pnpm install:dev
//
// Flags:
//   --firefox    target Firefox instead of Chrome
//   --zip        also produce a distributable .zip (wxt zip)
//   --watch      run the WXT dev server (HMR, auto-launches a browser) instead
//                of a one-shot build
//   --url=<base> override the API base URL for this run

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const extensionDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PROD_URL = "https://www.fanguard.app";
const DEV_URL = "http://localhost:3000";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const valueOf = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

const mode = args.find((a) => a === "prod" || a === "dev") ?? "dev";
const firefox = flag("firefox");
const browser = firefox ? "firefox" : "chrome";
const apiUrl = valueOf("url") ?? (mode === "prod" ? PROD_URL : DEV_URL);

// Validate early — a bad URL would silently break the host permission.
try {
  new URL(apiUrl);
} catch {
  console.error(`✖ Invalid API URL: ${apiUrl}`);
  process.exit(1);
}

const env = { ...process.env, WXT_PUBLIC_API_URL: apiUrl };

function run(cmd, cmdArgs) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: extensionDir,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`\n▶ Fanguard extension — ${mode.toUpperCase()} build`);
console.log(`  browser : ${browser}`);
console.log(`  API base: ${apiUrl}\n`);

// --watch: WXT dev server auto-launches a browser with the extension installed.
if (flag("watch")) {
  run("pnpm", ["exec", "wxt", "-b", browser]);
  process.exit(0);
}

run("pnpm", ["exec", "wxt", "build", "-b", browser]);
if (flag("zip")) run("pnpm", ["exec", "wxt", "zip", "-b", browser]);

const outDir = resolve(extensionDir, ".output", `${browser}-mv3`);
console.log(`\n✓ Built → ${outDir}\n`);

if (firefox) {
  console.log("Load it in Firefox:");
  console.log("  1. Open about:debugging#/runtime/this-firefox");
  console.log('  2. "Load Temporary Add-on…" → pick any file in the dir above\n');
} else {
  console.log("Load it in Chrome:");
  console.log("  1. Open chrome://extensions");
  console.log('  2. Enable "Developer mode" (top-right)');
  console.log(`  3. "Load unpacked" → select:\n     ${outDir}\n`);
  // On macOS, open the extensions page to save a step.
  if (process.platform === "darwin") {
    spawnSync("open", ["-a", "Google Chrome", "chrome://extensions"], { stdio: "ignore" });
  }
}
