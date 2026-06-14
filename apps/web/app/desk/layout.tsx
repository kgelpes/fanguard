import type { ReactNode } from "react";

import { DynamicProvider } from "~/components/providers/dynamic-provider";

// The operator console needs the embedded wallet (LP deposit/withdraw) bridged to
// wagmi — same provider as /checkout, scoped to this segment.
export default function DeskLayout({ children }: { children: ReactNode }) {
  return <DynamicProvider>{children}</DynamicProvider>;
}
