import { createRoot } from "react-dom/client";

import { Overlay } from "~/components/overlay";
import { detectEvent } from "~/lib/event-detection";
import "~/assets/tailwind.css";

export default defineContentScript({
  matches: ["*://*.stubhub.com/*"],
  cssInjectionMode: "ui",
  async main(ctx) {
    // FAN-6: read the event straight from the page's structured data. If this
    // isn't a recognizable event page, stay out of the way entirely.
    const event = detectEvent(document);
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
