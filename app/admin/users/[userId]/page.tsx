import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, KeyRound, Mail, Save, ShieldCheck } from "lucide-react";
import { UserRole } from "@prisma/client";

import {
  resetUserPasswordAction,
  updateUserAction,
} from "@/app/admin/actions";
import {
  FieldLabel,
  SelectInput,
  TextInput,
  USER_ROLE_DESCRIPTIONS,
  USER_ROLE_LABELS,
  UserManagementToast,
  UserRoleOptions,
} from "@/app/admin/users/_components";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatJalaliDate } from "@/lib/jalali-date";

type UserDetailPageProps = {
  params: Promise<{
    userId: string;
  }>;
  searchParams?: Promise<{
    error?: string;
    passwordReset?: string;
    userUpdated?: string;
  }>;
};

function getUserRoleBadgeClass(role: UserRole): string {
  if (role === UserRole.ADMIN) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (role === UserRole.MANAGER) {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default async function UserDetailPage({
  params,
  searchParams,
}: UserDetailPageProps) {
  const [currentAdmin, resolvedParams, resolvedSearchParams] =
    await Promise.all([
      requireRole([UserRole.ADMIN]),
      params,
      searchParams,
    ]);
  const user = await db.user.findUnique({
    where: { id: resolvedParams.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });

  if (!user) {
    notFound();
  }

  const redirectPath = `/admin/users/${user.id}`;
  const isCurrentAdmin = user.id === currentAdmin.id;

  return (
    <div className="grid gap-6" dir="rtl">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link href="/admin">
              <ChevronRight className="h-4 w-4" />
              بازگشت به کاربران
            </Link>
          </Button>
        }
        subtitle="ویرایش نقش، وضعیت فعال بودن و رمز موقت کاربر"
        title={user.name}
      />

      <UserManagementToast params={resolvedSearchParams} />

      <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <div className="grid gap-4 border-b pb-5 lg:grid-cols-[minmax(220px,0.8fr)_1fr] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-slate-950">
                {user.name}
              </h2>
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
            <p className="mt-2 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span dir="ltr">{user.email}</span>
            </p>
          </div>

          <div className="grid gap-2 rounded-md bg-muted/30 p-3 text-sm text-muted-foreground sm:grid-cols-2">
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
        </div>

        <form
          action={updateUserAction}
          className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.2fr_160px_minmax(190px,0.7fr)_auto] lg:items-end"
        >
          <input name="redirectPath" type="hidden" value={redirectPath} />
          <input name="userId" type="hidden" value={user.id} />
          <div className="grid gap-2">
            <FieldLabel htmlFor="user-name">نام</FieldLabel>
            <TextInput
              defaultValue={user.name}
              dir="rtl"
              id="user-name"
              maxLength={100}
              name="name"
              required
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="user-email">ایمیل</FieldLabel>
            <TextInput
              defaultValue={user.email}
              disabled
              dir="ltr"
              id="user-email"
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="user-role">نقش</FieldLabel>
            <SelectInput defaultValue={user.role} id="user-role" name="role">
              <UserRoleOptions />
            </SelectInput>
          </div>
          <div className="flex min-h-10 flex-col justify-end gap-2 rounded-md border bg-background px-3 py-2">
            {isCurrentAdmin ? (
              <input name="active" type="hidden" value="on" />
            ) : null}
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                className="h-4 w-4 rounded border-input"
                defaultChecked={user.active}
                disabled={isCurrentAdmin}
                name="active"
                type="checkbox"
              />
              حساب فعال باشد
            </label>
            {isCurrentAdmin ? (
              <p className="text-xs leading-5 text-muted-foreground">
                حساب خودتان از این صفحه غیرفعال نمی‌شود.
              </p>
            ) : null}
          </div>
          <Button className="w-full lg:w-auto" type="submit">
            <Save className="h-4 w-4" />
            ذخیره
          </Button>
        </form>
      </section>

      <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <div className="grid gap-1 border-b pb-5">
          <h2 className="font-medium text-slate-950">رمز موقت</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            برای ورود بعدی کاربر، یک رمز موقت جدید با حداقل ۸ کاراکتر تنظیم
            کنید.
          </p>
        </div>

        <form
          action={resetUserPasswordAction}
          className="mt-5 grid gap-4 md:grid-cols-[minmax(220px,1fr)_auto] md:items-end"
        >
          <input name="redirectPath" type="hidden" value={redirectPath} />
          <input name="userId" type="hidden" value={user.id} />
          <div className="grid gap-2">
            <FieldLabel htmlFor="user-password">رمز موقت جدید</FieldLabel>
            <TextInput
              dir="ltr"
              id="user-password"
              minLength={8}
              name="password"
              placeholder="حداقل ۸ کاراکتر"
              required
              type="password"
            />
          </div>
          <Button className="w-full md:w-auto" type="submit" variant="outline">
            <KeyRound className="h-4 w-4" />
            تنظیم رمز
          </Button>
        </form>
      </section>
    </div>
  );
}
