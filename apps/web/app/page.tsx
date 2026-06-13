import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className={cn("text-4xl font-bold tracking-tight")}>Fanguard</h1>
        <p className="text-muted-foreground max-w-md">
          Turborepo + Next.js 16 + React Compiler + Tailwind v4 + shadcn/ui + t3-env.
        </p>
      </div>
      <div className="flex gap-3">
        <Button>Get started</Button>
        <Button variant="outline" asChild>
          <a href="https://docs.polymarket.com" target="_blank" rel="noreferrer">
            Polymarket API
          </a>
        </Button>
      </div>
    </main>
  );
}
