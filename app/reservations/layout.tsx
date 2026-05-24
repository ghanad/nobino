import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { requireCurrentUser } from "@/lib/auth";

export default async function ReservationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireCurrentUser();

  return <AppShell user={user}>{children}</AppShell>;
}
