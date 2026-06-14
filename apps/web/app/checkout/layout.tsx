import type { ReactNode } from "react";

import { DynamicProvider } from "~/components/providers/dynamic-provider";
import { TestModeProvider } from "~/lib/test-mode";
import { env } from "~/env";

// Scope Dynamic + wagmi to the /checkout segment so the SDK bundle and the
// client boundary stay off the landing/lookup pages.
export default function CheckoutLayout({ children }: { children: ReactNode }) {
  // Default test mode on when a test premium is configured; the user can flip it
  // and the choice persists in localStorage.
  const defaultTestMode = typeof env.NEXT_PUBLIC_FLOW_TEST_PREMIUM_USD === "number";
  return (
    <TestModeProvider defaultOn={defaultTestMode}>
      <DynamicProvider>{children}</DynamicProvider>
    </TestModeProvider>
  );
}
