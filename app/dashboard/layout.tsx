import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { requireCurrentUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireCurrentUser();

  return (
    <AppShell user={user} title="Dashboard">
      {children}
    </AppShell>
  );
}
