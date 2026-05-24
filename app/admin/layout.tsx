import { UserRole } from "@prisma/client";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { requireRole } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireRole([UserRole.ADMIN]);

  return <AppShell user={user}>{children}</AppShell>;
}
