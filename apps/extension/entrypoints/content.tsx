import { createRoot } from "react-dom/client";

import { Overlay } from "~/components/overlay";
import "~/assets/tailwind.css";

export default defineContentScript({
  matches: ["*://*.stubhub.com/*"],
  cssInjectionMode: "ui",
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: "fanguard-overlay",
      position: "inline",
      anchor: "body",
      onMount(container) {
        const root = createRoot(container);
        root.render(<Overlay />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
