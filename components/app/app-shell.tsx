import Link from "next/link";
import type { ReactNode } from "react";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { getUnreadNotificationCount } from "@/lib/notification-service";
import { canAccessAdminArea, canAccessManagerArea } from "@/lib/permissions";

type AppShellProps = {
  user: CurrentUser;
  title: string;
  children: ReactNode;
};

export async function AppShell({ user, title, children }: AppShellProps) {
  const unreadNotificationCount = await getUnreadNotificationCount(user.id);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Nobino Reservations
            </p>
            <h1 className="text-xl font-semibold tracking-normal">{title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/reservations">Reservations</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/notifications">
                <Bell className="h-4 w-4" />
                Notifications
                {unreadNotificationCount > 0 ? (
                  <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                    {unreadNotificationCount}
                  </span>
                ) : null}
              </Link>
            </Button>
            {canAccessManagerArea(user.role) ? (
              <Button variant="ghost" asChild>
                <Link href="/manager">Manager</Link>
              </Button>
            ) : null}
            {canAccessAdminArea(user.role) ? (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/admin">Admin</Link>
                </Button>
                <Button variant="ghost" asChild>
                  <Link href="/admin/audit">Audit</Link>
                </Button>
              </>
            ) : null}
            <form action={logoutAction}>
              <Button type="submit" variant="outline">
                Log out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-6 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{user.name}</span>{" "}
          ({user.role})
        </div>
        {children}
      </div>
    </main>
  );
}
