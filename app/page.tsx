import { CalendarDays, Database, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

const productRules = [
  "Identical systems are represented as one resource pool with capacity.",
  "Pending reservations stay visible but do not consume capacity.",
  "Approved reservations consume capacity after manager approval.",
  "Reservations are hourly and cannot span multiple calendar days.",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
        <div className="max-w-3xl">
          <p className="mb-3 text-sm font-medium text-muted-foreground">
            Phase 0 bootstrap
          </p>
          <h1 className="text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
            Nobino Reservations
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            A small internal reservation app for booking capacity from a shared
            pool of identical company systems.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button>Health check ready</Button>
            <Button variant="outline">SQLite configured</Button>
          </div>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-card p-5 text-card-foreground">
            <Database className="mb-4 h-5 w-5 text-primary" />
            <h2 className="font-medium">Resource pool</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Capacity is configured centrally instead of assigning physical
              device numbers.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-5 text-card-foreground">
            <ShieldCheck className="mb-4 h-5 w-5 text-primary" />
            <h2 className="font-medium">Manager approval</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Requests become final only when a manager approves them.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-5 text-card-foreground">
            <CalendarDays className="mb-4 h-5 w-5 text-primary" />
            <h2 className="font-medium">Hourly schedule</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The app will enforce configurable working days and hourly booking
              windows in later phases.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-lg border bg-muted/40 p-5">
          <h2 className="text-sm font-medium">Current product constraints</h2>
          <ul className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
            {productRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
