import { UserRole } from "@prisma/client";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { requireRole } from "@/lib/auth";

export default async function ManagerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireRole([UserRole.MANAGER, UserRole.ADMIN]);

  return <AppShell user={user}>{children}</AppShell>;
}
