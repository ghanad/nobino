import Link from "next/link";
import { Mail, ShieldCheck, UserCheck, UserPlus, UserX } from "lucide-react";
import { UserRole } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { formatJalaliDate } from "@/lib/jalali-date";

import {
  formatPersianNumber,
  getUserRoleBadgeClass,
  USER_ROLE_DESCRIPTIONS,
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
    canViewLunchReport: boolean;
    createdAt: Date;
  }>;
}) {
  const activeUsers = users.filter((user) => user.active).length;
  const adminUsers = users.filter((user) => user.role === UserRole.ADMIN).length;
  const managerUsers = users.filter(
    (user) => user.role === UserRole.MANAGER,
  ).length;

  return (
    <section className="grid gap-5 text-card-foreground" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-slate-950">
            مدیریت کاربران
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            این صفحه فقط نمای کلی کاربران است. ساخت، ویرایش و تنظیم رمز در
            صفحه جدا انجام می‌شود.
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/admin/users/new">
            <UserPlus className="h-4 w-4" />
            ساخت کاربر
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">کل کاربران</p>
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

      <div className="grid gap-3">
        {users.map((user) => (
          <div className="rounded-lg border bg-card p-4 shadow-sm" key={user.id}>
            <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.8fr)_1fr_auto] lg:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                    user.active
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {user.active ? (
                    <UserCheck className="h-5 w-5" />
                  ) : (
                    <UserX className="h-5 w-5" />
                  )}
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
                    {user.canViewLunchReport ? (
                      <span className="inline-flex h-6 items-center rounded-full bg-cyan-50 px-2 text-xs font-medium text-cyan-800">
                        گزارش ناهار
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span dir="ltr">{user.email}</span>
                  </p>
                </div>
              </div>

              <div className="grid gap-2 rounded-md bg-muted/30 p-3 text-sm text-muted-foreground md:grid-cols-2">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  <span>{USER_ROLE_DESCRIPTIONS[user.role]}</span>
                </div>
                <div>
                  ساخته شده در{" "}
                  <span className="font-medium text-slate-700">
                    {formatJalaliDate(user.createdAt)}
                  </span>
                </div>
              </div>

              <Button asChild className="w-full lg:w-auto" variant="outline">
                <Link href={`/admin/users/${user.id}`}>جزئیات و ویرایش</Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
