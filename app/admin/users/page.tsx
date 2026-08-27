import { UserRole } from "@prisma/client";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getAdminToast,
  UserManagement,
} from "@/app/admin/_sections";

import { UsersTeamsSectionShell } from "@/app/admin/_components/users-teams-section";

type AdminUsersPageProps = {
  searchParams?: Promise<{
    error?: string;
    passwordReset?: string;
    memberAdded?: string;
    userCreated?: string;
    userDeleted?: string;
    userUpdated?: string;
  }>;
};

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const toast = getAdminToast(params);
  const users = await db.user.findMany({
    where: { deletedAt: null },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      teamMemberships: {
        orderBy: { team: { name: "asc" } },
        select: {
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return (
    <UsersTeamsSectionShell>
      {toast ? <UrlToast {...toast} /> : null}
      <UserManagement users={users} />
    </UsersTeamsSectionShell>
  );
}
