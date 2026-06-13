import { createRoot } from "react-dom/client";

import { Overlay } from "~/components/overlay";
import { detectEvent, isCheckoutUrl, type DetectedEvent } from "~/lib/event-detection";
import "~/assets/tailwind.css";

const THROTTLE_MS = 600;
const MAX_WAIT_MS = 20_000;

/**
 * The overlay is a checkout-only upsell, so we only detect once the fan is in
 * the purchase flow — never on event/listing pages. The checkout host is a
 * client-rendered SPA whose title/header land after load (and a soft navigation
 * may carry us into it after the script runs), so we can't rely on a single
 * read. Rather than blind-poll (each `detectEvent` re-parses JSON-LD and scans
 * the whole page text), react to DOM mutations: idle pages cost nothing, and a
 * hydrating checkout is only scanned when it actually changes — throttled so a
 * render storm can't trigger a flood of full-page reads. Resolves null on
 * timeout or when we're never carried into a recognizable checkout.
 */
function waitForCheckoutEvent(ctx: {
  onInvalidated?: (cb: () => void) => void;
}): Promise<DetectedEvent | null> {
  const detect = () =>
    isCheckoutUrl(window.location.href) ? detectEvent(document) : null;

  return new Promise((resolve) => {
    const immediate = detect();
    if (immediate) return resolve(immediate);

    const finish = (value: DetectedEvent | null) => {
      observer.disconnect();
      clearTimeout(deadline);
      resolve(value);
    };

    let throttled = false;
    const observer = new MutationObserver(() => {
      if (throttled) return;
      throttled = true;
      setTimeout(() => {
        throttled = false;
        const event = detect();
        if (event) finish(event);
      }, THROTTLE_MS);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    const deadline = setTimeout(() => finish(null), MAX_WAIT_MS);
    ctx.onInvalidated?.(() => finish(null));
  });
}

export default defineContentScript({
  matches: ["*://*.stubhub.com/*"],
  cssInjectionMode: "ui",
  async main(ctx) {
    // FAN-6: read the event straight from the page's structured data, but only
    // once the fan reaches checkout. If we're not at checkout with a recognizable
    // fixture, stay out of the way entirely.
    const event = await waitForCheckoutEvent(ctx);
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
