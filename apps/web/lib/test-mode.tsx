"use client";

import * as React from "react";
import { POLYMARKET_MIN_FUNDING_USD } from "@fanguard/pricing";

/**
 * Global test mode. When on, the checkout charges the Polymarket order minimum
 * instead of the real premium (so a live hedge can still be placed for pennies).
 * Off → the fan pays the full premium. The toggle is app-wide and persists in
 * localStorage, so it survives reloads and applies everywhere it's read.
 */

const STORAGE_KEY = "fanguard:test-mode";

interface TestModeContextValue {
  testMode: boolean;
  setTestMode: (value: boolean) => void;
}

const TestModeContext = React.createContext<TestModeContextValue | null>(null);

export function TestModeProvider({
  children,
  defaultOn = false,
}: {
  children: React.ReactNode;
  /** Initial value before localStorage hydrates (SSR-safe, deterministic). */
  defaultOn?: boolean;
}) {
  const [testMode, setTestModeState] = React.useState(defaultOn);

  // Hydrate the persisted choice after mount (localStorage isn't available SSR).
  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored != null) setTestModeState(stored === "1");
  }, []);

  const setTestMode = React.useCallback((value: boolean) => {
    setTestModeState(value);
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  }, []);

  const value = React.useMemo(() => ({ testMode, setTestMode }), [testMode, setTestMode]);
  return <TestModeContext.Provider value={value}>{children}</TestModeContext.Provider>;
}

export function useTestMode(): TestModeContextValue {
  const ctx = React.useContext(TestModeContext);
  if (!ctx) throw new Error("useTestMode must be used within a TestModeProvider");
  return ctx;
}

/** Standalone global toggle — drop it anywhere inside a TestModeProvider. */
export function TestModeToggle({ className }: { className?: string }) {
  const { testMode, setTestMode } = useTestMode();
  return (
    <label className={"flex items-center gap-2 text-sm " + (className ?? "")}>
      <input
        type="checkbox"
        checked={testMode}
        onChange={(e) => setTestMode(e.target.checked)}
        className="size-4"
      />
      <span className="font-medium">Test mode</span>
      <span className="text-muted-foreground text-xs">
        charge ${POLYMARKET_MIN_FUNDING_USD} (enough to fund the hedge), not the full premium
      </span>
    </label>
  );
}
