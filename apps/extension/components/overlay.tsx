import { useState } from "react";

import { Button } from "~/components/ui/button";

export function Overlay() {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <div className="fixed bottom-4 right-4 z-[2147483647]">
        <Button size="sm" onClick={() => setOpen(true)}>
          Fanguard
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-card text-card-foreground fixed bottom-4 right-4 z-[2147483647] w-72 rounded-xl border p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Fanguard</span>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Hide
        </Button>
      </div>
      <p className="text-muted-foreground mt-2 text-sm">
        Polymarket odds overlay mounts here.
      </p>
    </div>
  );
}
