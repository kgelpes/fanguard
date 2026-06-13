import { Button } from "~/components/ui/button";

export function App() {
  return (
    <div className="bg-background text-foreground flex w-72 flex-col gap-3 p-4">
      <div>
        <h1 className="text-base font-semibold">Fanguard</h1>
        <p className="text-muted-foreground text-sm">Polymarket odds overlay.</p>
      </div>
      <Button className="w-full" size="sm">
        Open dashboard
      </Button>
    </div>
  );
}
