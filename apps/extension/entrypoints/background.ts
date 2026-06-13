import { resolveFixture } from "@fanguard/polymarket";

import type { FanguardMessage, ResolveFixtureResponse } from "~/lib/messages";

/**
 * The background service worker holds the extension's host permissions, so it
 * (not the content script) makes the cross-origin call to Polymarket's Gamma
 * API — content-script `fetch` is still bound by the page's CORS policy.
 */
export default defineBackground(() => {
  console.log("Fanguard background ready", { id: browser.runtime.id });

  browser.runtime.onMessage.addListener(
    async (message: FanguardMessage): Promise<ResolveFixtureResponse | undefined> => {
      if (message?.type !== "RESOLVE_FIXTURE") return undefined;
      try {
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
