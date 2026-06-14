#!/usr/bin/env node
// Build the Fanguard extension (prod, pointed at this site's own API) and drop
// the zip into public/ so the website can serve it as a download. Runs as the
// web app's `prebuild`, so every `next build` / Vercel deploy ships a zip that
// matches the current code and the prod API base.
//
// The artifact is generated, not committed (see apps/web/.gitignore).

import { spawnSync } from "node:child_process";
import { readdirSync, copyFileSync, mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = resolve(webDir, "../extension");
const outputDir = join(extensionDir, ".output");
const publicDir = join(webDir, "public");
const dest = join(publicDir, "fanguard-extension.zip");

// Prod build talks to our own domain (Dublin region → dodges the Polymarket
// US geofence). Keep in sync with apps/extension/scripts/install.mjs.
const env = { ...process.env, WXT_PUBLIC_API_URL: "https://www.fanguard.app" };

console.log("▶ Bundling Fanguard extension for download (prod)…");
const build = spawnSync("pnpm", ["exec", "wxt", "zip", "-b", "chrome"], {
  cwd: extensionDir,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (build.status !== 0) {
  console.error("✖ Extension zip build failed.");
  process.exit(build.status ?? 1);
}

// wxt names the artifact <name>-<version>-chrome.zip; pick the newest match.
const zips = readdirSync(outputDir)
  .filter((f) => f.endsWith("-chrome.zip"))
  .map((f) => ({ f, mtime: statSync(join(outputDir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

if (zips.length === 0) {
  console.error(`✖ No *-chrome.zip found in ${outputDir}`);
  process.exit(1);
}

mkdirSync(publicDir, { recursive: true });
copyFileSync(join(outputDir, zips[0].f), dest);
console.log(`✓ ${zips[0].f} → public/fanguard-extension.zip`);
