import { resolveFixture, type FixtureResolution } from "@fanguard/polymarket";

import { env } from "~/env";
import type { FanguardMessage, ResolveFixtureResponse } from "~/lib/messages";

/**
 * The background service worker holds the extension's host permissions, so it
 * (not the content script) makes the cross-origin request — content-script
 * `fetch` is still bound by the page's CORS policy.
 *
 * Resolution has two modes, picked at build time by `WXT_PUBLIC_API_URL`
 * (see scripts/install.mjs):
 *  - set (prod/dev-against-Vercel): proxy through the Fanguard `/api/fixtures`
 *    endpoint, which runs in Dublin and so dodges Polymarket's US geofence.
 *  - unset: call Polymarket's Gamma API directly from the worker.
 */
const apiUrl = env.WXT_PUBLIC_API_URL?.replace(/\/$/, "");

async function resolveViaApi(base: string, query: string): Promise<ResolveFixtureResponse> {
  const url = new URL(`${base}/api/fixtures`);
  url.searchParams.set("q", query);
  url.searchParams.set("shutout", "1");

  const response = await fetch(url, { headers: { accept: "application/json" } });
  const body = (await response.json().catch(() => null)) as
    | FixtureResolution
    | { error?: string; code?: string }
    | null;

  if (!response.ok) {
    const err = (body ?? {}) as { error?: string; code?: string };
    return {
      ok: false,
      error: err.error ?? `Fixture request failed (${response.status}).`,
      code: err.code,
    };
  }
  return { ok: true, data: body as FixtureResolution };
}

export default defineBackground(() => {
  console.log("Fanguard background ready", { id: browser.runtime.id, apiUrl: apiUrl ?? "(direct)" });

  browser.runtime.onMessage.addListener(
    async (message: FanguardMessage): Promise<ResolveFixtureResponse | undefined> => {
      if (message?.type !== "RESOLVE_FIXTURE") return undefined;
      try {
        if (apiUrl) return await resolveViaApi(apiUrl, message.query);
        const data = await resolveFixture(message.query, { includeShutoutLeg: true });
        return { ok: true, data };
      } catch (error) {
        const code = (error as { code?: string })?.code;
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to resolve fixture.",
          code,
        };
      }
    },
  );
});
