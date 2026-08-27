import Link from "next/link";
import { Mail, Users, UserPlus } from "lucide-react";
import { UserRole } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { formatJalaliDate } from "@/lib/jalali-date";
import { UsersTeamsPageFrame } from "./users-teams-section";

import {
  formatPersianNumber,
  getUserRoleBadgeClass,
  USER_ROLE_LABELS,
} from "./admin-formatting";

export function UserManagement({
  users,
}: {
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: UserRole;
    active: boolean;
    createdAt: Date;
    teamMemberships: Array<{
      team: {
        id: string;
        name: string;
      };
    }>;
  }>;
}) {
  const activeUsers = users.filter((user) => user.active).length;
  const adminUsers = users.filter((user) => user.role === UserRole.ADMIN).length;
  const managerUsers = users.filter(
    (user) => user.role === UserRole.MANAGER,
  ).length;

  return (
    <UsersTeamsPageFrame
      action={
        <Button asChild className="w-full sm:w-auto">
          <Link href="/admin/users/new">
            <UserPlus className="h-4 w-4" />
            ساخت کاربر
          </Link>
        </Button>
      }
      description="این صفحه فقط نمای کلی کاربران است. ساخت، ویرایش و تنظیم رمز در صفحه جدا انجام می‌شود."
      summary={
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">
              کل کاربران
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {formatPersianNumber(users.length)}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">فعال</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">
              {formatPersianNumber(activeUsers)}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">
              مدیر و ادمین
            </p>
            <p className="mt-2 text-2xl font-semibold text-blue-700">
              {formatPersianNumber(managerUsers + adminUsers)}
            </p>
          </div>
        </div>
      }
      title="نمای کلی کاربران"
    >
      {users.map((user) => {
          const userTeams = user.teamMemberships.map(
            (membership) => membership.team,
          );
          const visibleTeam = userTeams[0];
          const additionalTeamCount = Math.max(userTeams.length - 1, 0);

        return (
            <div
              className="rounded-lg border bg-card px-4 py-3 shadow-sm"
              key={user.id}
            >
              <div className="grid gap-3 md:grid-cols-[minmax(240px,1.2fr)_minmax(180px,0.8fr)_auto] md:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                      user.active
                        ? "bg-emerald-50 font-semibold text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                    aria-hidden="true"
                  >
                    {user.name.trim().charAt(0) || "؟"}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-medium text-slate-950">
                        {user.name}
                      </h3>
                      <span
                        className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium ${getUserRoleBadgeClass(
                          user.role,
                        )}`}
                      >
                        {USER_ROLE_LABELS[user.role]}
                      </span>
                      <span
                        className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-medium ${
                          user.active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {user.active ? "فعال" : "غیرفعال"}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span dir="ltr">{user.email}</span>
                    </p>
                  </div>
                </div>

                <div className="grid min-w-0 gap-1.5 text-sm">
                  <div className="flex min-w-0 items-center gap-2 text-slate-700">
                    <Users className="h-4 w-4 shrink-0 text-slate-500" />
                    {visibleTeam ? (
                      <div
                        className="flex min-w-0 items-center gap-1.5"
                        title={userTeams.map((team) => team.name).join("، ")}
                      >
                        <span className="truncate font-medium">
                          {visibleTeam.name}
                        </span>
                        {additionalTeamCount > 0 ? (
                          <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
                            +{formatPersianNumber(additionalTeamCount)}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">بدون تیم</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ساخته شده در {formatJalaliDate(user.createdAt)}
                  </p>
                </div>

                <Button asChild className="w-full md:w-auto" variant="outline">
                  <Link href={`/admin/users/${user.id}`}>جزئیات و ویرایش</Link>
                </Button>
              </div>
            </div>
        );
      })}
    </UsersTeamsPageFrame>
  );
}
