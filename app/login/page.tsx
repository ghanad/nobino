import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { loginAction } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [params, currentUser] = await Promise.all([
    searchParams,
    getCurrentUser(),
  ]);

  if (currentUser) {
    redirect("/dashboard");
  }

  const hasInvalidLogin = params.error === "invalid";

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6 py-12">
      <section className="w-full max-w-sm rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Nobino Reservations
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            Sign in
          </h1>
        </div>

        {hasInvalidLogin ? (
          <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Invalid email or password.
          </div>
        ) : null}

        <form action={loginAction} className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-medium">
            Email
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Password
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>

        <div className="mt-6 rounded-md bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
          Seeded users: admin@nobino.local, manager@nobino.local, and
          user@nobino.local.
        </div>
      </section>
    </main>
  );
}
