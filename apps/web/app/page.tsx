import Link from "next/link";
import { Download } from "lucide-react";

import { FixtureLookup } from "~/components/fixture-lookup";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center gap-8 p-8 pt-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className={cn("text-4xl font-bold tracking-tight")}>Fanguard</h1>
        <p className="text-muted-foreground max-w-md">
          Enter a fixture or paste a ticket title to find its Polymarket spread markets and the
          per-team blowout combo that powers the cover.
        </p>
      </div>
      <FixtureLookup />
      <Button asChild variant="outline">
        <Link href="/install">
          <Download />
          Get the browser extension
        </Link>
      </Button>
    </main>
  );
}
