import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronRight,
  KeyRound,
  Mail,
  Save,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { UserRole } from "@prisma/client";

import {
  addTeamMemberAction,
  deleteUserAction,
  removeTeamMemberAction,
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
    memberAdded?: string;
    memberRemoved?: string;
    passwordReset?: string;
    userDeleted?: string;
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
  const [user, teams] = await Promise.all([
    db.user.findUnique({
      where: { id: resolvedParams.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        canViewLunchReport: true,
        deletedAt: true,
        createdAt: true,
        teamMemberships: {
          orderBy: { team: { name: "asc" } },
          select: {
            id: true,
            team: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    }),
    db.team.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  if (!user || user.deletedAt) {
    notFound();
  }

  const redirectPath = `/admin/users/${user.id}`;
  const isCurrentAdmin = user.id === currentAdmin.id;
  const assignedTeamIds = new Set(
    user.teamMemberships.map((membership) => membership.team.id),
  );
  const availableTeams = teams.filter((team) => !assignedTeamIds.has(team.id));

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
        subtitle="مدیریت نقش، دسترسی‌ها، تیم‌ها و رمز موقت کاربر"
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
          className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.2fr_160px_minmax(190px,0.7fr)_minmax(210px,0.8fr)_auto] lg:items-end"
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
          <label className="flex min-h-10 flex-col justify-center gap-1 rounded-md border bg-background px-3 py-2 text-sm font-medium">
            <span className="flex items-center gap-2">
              <input
                className="h-4 w-4 rounded border-input"
                defaultChecked={user.canViewLunchReport}
                name="canViewLunchReport"
                type="checkbox"
              />
              دسترسی گزارش ناهار
            </span>
            <span className="text-xs font-normal leading-5 text-muted-foreground">
              کاربر عادی فقط با این دسترسی گزارش روزانه را می‌بیند.
            </span>
          </label>
          <Button className="w-full lg:w-auto" type="submit">
            <Save className="h-4 w-4" />
            ذخیره
          </Button>
        </form>
      </section>

      <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <div className="grid gap-1 border-b pb-5">
          <h2 className="font-medium text-slate-950">تیم‌ها</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            عضویت‌های تیمی این کاربر را از همین صفحه مدیریت کنید.
          </p>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_minmax(280px,0.8fr)]">
          <div className="grid content-start gap-3">
            <h3 className="text-sm font-medium text-slate-950">
              تیم‌های اختصاص‌یافته
            </h3>
            {user.teamMemberships.length === 0 ? (
              <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                این کاربر هنوز عضو هیچ تیمی نیست.
              </div>
            ) : (
              user.teamMemberships.map((membership) => (
                <div
                  className="flex flex-col gap-3 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                  key={membership.id}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Users className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="truncate text-sm font-medium text-slate-900">
                      {membership.team.name}
                    </span>
                  </div>
                  <form action={removeTeamMemberAction}>
                    <input
                      name="redirectPath"
                      type="hidden"
                      value={redirectPath}
                    />
                    <input
                      name="teamId"
                      type="hidden"
                      value={membership.team.id}
                    />
                    <input name="userId" type="hidden" value={user.id} />
                    <Button
                      className="w-full sm:w-auto"
                      size="sm"
                      type="submit"
                      variant="outline"
                    >
                      <UserMinus className="h-4 w-4" />
                      حذف از تیم
                    </Button>
                  </form>
                </div>
              ))
            )}
          </div>

          <div className="grid content-start gap-3 rounded-md bg-muted/30 p-4">
            <div className="grid gap-1">
              <h3 className="text-sm font-medium text-slate-950">
                افزودن به تیم
              </h3>
              <p className="text-xs leading-5 text-muted-foreground">
                هر کاربر می‌تواند همزمان عضو چند تیم باشد.
              </p>
            </div>
            {availableTeams.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                تیم دیگری برای افزودن وجود ندارد.
              </p>
            ) : (
              <form action={addTeamMemberAction} className="grid gap-3">
                <input
                  name="redirectPath"
                  type="hidden"
                  value={redirectPath}
                />
                <input name="userId" type="hidden" value={user.id} />
                <div className="grid gap-2">
                  <FieldLabel htmlFor="user-team">تیم</FieldLabel>
                  <SelectInput
                    defaultValue=""
                    id="user-team"
                    name="teamId"
                    required
                  >
                    <option disabled value="">
                      انتخاب تیم…
                    </option>
                    {availableTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </SelectInput>
                </div>
                <Button className="w-full" type="submit">
                  <UserPlus className="h-4 w-4" />
                  افزودن به تیم
                </Button>
              </form>
            )}
          </div>
        </div>
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

      {!isCurrentAdmin ? (
        <section className="rounded-lg border border-red-200 bg-card p-5 text-card-foreground shadow-sm">
          <div className="grid gap-1 border-b border-red-100 pb-5">
            <h2 className="font-medium text-red-800">حذف کاربر</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              با حذف کاربر، حساب او غیرفعال و از فهرست کاربران پنهان می‌شود؛
              رزروها و تاریخچه تغییرات برای گزارش‌گیری باقی می‌مانند.
            </p>
          </div>

          <form action={deleteUserAction} className="mt-5 flex justify-end">
            <input name="redirectPath" type="hidden" value={redirectPath} />
            <input name="userId" type="hidden" value={user.id} />
            <Button
              className="w-full bg-red-700 text-white hover:bg-red-800 sm:w-auto"
              type="submit"
            >
              <Trash2 className="h-4 w-4" />
              حذف کاربر
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
