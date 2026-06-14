import type { Metadata } from "next";
import { Download } from "lucide-react";

import { Button } from "~/components/ui/button";

export const metadata: Metadata = {
  title: "Install Fanguard",
  description: "Download the Fanguard browser extension.",
};

const steps = [
  "Download the zip and unzip it anywhere.",
  "Open chrome://extensions in Chrome.",
  'Toggle on "Developer mode" (top-right).',
  'Click "Load unpacked" and select the unzipped folder.',
  "Open a StubHub event page — the Fanguard overlay appears.",
];

export default function InstallPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col gap-8 p-8 pt-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight">Install Fanguard</h1>
        <p className="text-muted-foreground">
          The extension overlays Polymarket blowout odds onto live StubHub event pages and quotes
          your one-tap cover. This build talks to the Fanguard production API.
        </p>
      </div>

      <Button asChild size="lg" className="self-start">
        <a href="/fanguard-extension.zip" download>
          <Download />
          Download for Chrome
        </a>
      </Button>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Load it unpacked</h2>
        <ol className="text-muted-foreground flex list-decimal flex-col gap-2 pl-5">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="text-muted-foreground text-sm">
          Chrome only auto-installs extensions from the Web Store, so for now it loads unpacked in
          Developer mode. Works in any Chromium browser (Chrome, Brave, Arc, Edge).
        </p>
      </div>
    </main>
  );
}
