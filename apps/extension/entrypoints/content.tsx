import { createRoot } from "react-dom/client";

import { Overlay } from "~/components/overlay";
import { detectEvent, type DetectedEvent } from "~/lib/event-detection";
import "~/assets/tailwind.css";

const RETRY_INTERVAL_MS = 600;
const MAX_WAIT_MS = 20_000;

/**
 * Event pages are server-rendered (JSON-LD is in the initial HTML), but the
 * checkout host is a client-rendered SPA whose title/header land after load.
 * Poll detection until it succeeds or we give up, so the overlay appears on
 * both. Resolves null if the page never reveals a fixture.
 */
function waitForEvent(ctx: {
  onInvalidated?: (cb: () => void) => void;
}): Promise<DetectedEvent | null> {
  return new Promise((resolve) => {
    const immediate = detectEvent(document);
    if (immediate) return resolve(immediate);

    const started = Date.now();
    const interval = setInterval(() => {
      const event = detectEvent(document);
      if (event) return finish(event);
      if (Date.now() - started >= MAX_WAIT_MS) finish(null);
    }, RETRY_INTERVAL_MS);

    const finish = (value: DetectedEvent | null) => {
      clearInterval(interval);
      resolve(value);
    };

    ctx.onInvalidated?.(() => finish(null));
  });
}

export default defineContentScript({
  matches: ["*://*.stubhub.com/*"],
  cssInjectionMode: "ui",
  async main(ctx) {
    // FAN-6: read the event straight from the page's structured data. If this
    // isn't a recognizable event page, stay out of the way entirely.
    const event = await waitForEvent(ctx);
    if (!event) return;

    const ui = await createShadowRootUi(ctx, {
      name: "fanguard-overlay",
      position: "inline",
      anchor: "body",
      onMount(container) {
        const root = createRoot(container);
        root.render(<Overlay event={event} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
