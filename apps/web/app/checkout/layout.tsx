import type { ReactNode } from "react";

import { DynamicProvider } from "~/components/providers/dynamic-provider";

// Scope Dynamic + wagmi to the /checkout segment so the SDK bundle and the
// client boundary stay off the landing/lookup pages.
export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return <DynamicProvider>{children}</DynamicProvider>;
}
