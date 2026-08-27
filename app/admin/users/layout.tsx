import type { ReactNode } from "react";

import { UsersTeamsSectionShell } from "@/app/admin/_components/users-teams-section";

export default function UsersLayout({ children }: { children: ReactNode }) {
  return <UsersTeamsSectionShell>{children}</UsersTeamsSectionShell>;
}
