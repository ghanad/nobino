import { UserRole } from "@prisma/client";

import { PageHeader } from "@/components/app/page-header";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ADMIN_PAGE_LABELS,
  getAdminToast,
  UserManagement,
} from "@/app/admin/_sections";

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
    <div className="grid gap-6">
      <PageHeader
        subtitle="نمای کلی کاربران، نقش‌ها، وضعیت و عضویت تیمی"
        title={ADMIN_PAGE_LABELS.users}
      />

      {toast ? <UrlToast {...toast} /> : null}
      <UserManagement users={users} />
    </div>
  );
}