import { Button } from "~/components/ui/button";

export function App() {
  return (
    <div className="bg-background text-foreground flex w-72 flex-col gap-3 p-4">
      <div className="flex items-center gap-2.5">
        <img src="/fanguard-shield.png" alt="" className="size-8" />
        <div>
          <h1 className="text-base font-semibold tracking-tight">FanGuard</h1>
          <p className="text-muted-foreground text-xs">Insure your ticket. One tap.</p>
        </div>
      </div>
      <Button className="w-full" size="sm">
        Open dashboard
      </Button>
    </div>
  );
}
