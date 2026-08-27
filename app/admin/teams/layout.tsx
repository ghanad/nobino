import type { ReactNode } from "react";

import { UsersTeamsSectionShell } from "@/app/admin/_components/users-teams-section";

export default function TeamsLayout({ children }: { children: ReactNode }) {
  return <UsersTeamsSectionShell>{children}</UsersTeamsSectionShell>;
}
