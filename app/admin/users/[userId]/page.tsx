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
    <div className="grid gap-5" dir="rtl">
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

      <section className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">
            اطلاعات عمومی
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            اطلاعات پایه حساب، نقش و دسترسی‌های کاربر
          </p>
        </div>

        <form
          action={updateUserAction}
          className="grid"
        >
          <input name="redirectPath" type="hidden" value={redirectPath} />
          <input name="userId" type="hidden" value={user.id} />

          <div className="grid gap-5 p-5">
            <div className="grid gap-4 border-b pb-5 lg:grid-cols-[minmax(220px,0.8fr)_1fr] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-lg font-semibold text-slate-950">
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
                <p className="mt-2 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span dir="ltr">{user.email}</span>
                </p>
              </div>

              <div className="grid gap-3 rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground sm:grid-cols-2">
                <div className="flex items-start gap-2">
                  <ShieldCheck
                    className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"
                    aria-hidden="true"
                  />
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

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1.2fr_180px]">
              <div className="grid content-start gap-2">
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
              <div className="grid content-start gap-2">
                <FieldLabel htmlFor="user-email">ایمیل</FieldLabel>
                <TextInput
                  defaultValue={user.email}
                  disabled
                  dir="ltr"
                  id="user-email"
                />
              </div>
              <div className="grid content-start gap-2">
                <FieldLabel htmlFor="user-role">نقش</FieldLabel>
                <SelectInput
                  defaultValue={user.role}
                  id="user-role"
                  name="role"
                >
                  <UserRoleOptions />
                </SelectInput>
              </div>
            </div>

            <div className="grid gap-3 rounded-md border bg-muted/20 p-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  تنظیمات دسترسی
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  وضعیت حساب و دسترسی‌های تکمیلی را مدیریت کنید.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex min-h-14 items-start gap-3 rounded-md border bg-background p-3 text-sm transition-colors hover:border-slate-300">
                  {isCurrentAdmin ? (
                    <input name="active" type="hidden" value="on" />
                  ) : null}
                  <input
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-input outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    defaultChecked={user.active}
                    disabled={isCurrentAdmin}
                    name="active"
                    type="checkbox"
                  />
                  <span className="grid gap-1">
                    <span className="font-medium text-slate-900">
                      حساب فعال باشد
                    </span>
                    {isCurrentAdmin ? (
                      <span className="text-xs font-normal leading-5 text-muted-foreground">
                        حساب خودتان از این صفحه غیرفعال نمی‌شود.
                      </span>
                    ) : (
                      <span className="text-xs font-normal leading-5 text-muted-foreground">
                        کاربر امکان ورود و استفاده از سامانه را داشته باشد.
                      </span>
                    )}
                  </span>
                </label>

                <label className="flex min-h-14 items-start gap-3 rounded-md border bg-background p-3 text-sm transition-colors hover:border-slate-300">
                  <input
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-input outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    defaultChecked={user.canViewLunchReport}
                    name="canViewLunchReport"
                    type="checkbox"
                  />
                  <span className="grid gap-1">
                    <span className="font-medium text-slate-900">
                      دسترسی گزارش ناهار
                    </span>
                    <span className="text-xs font-normal leading-5 text-muted-foreground">
                      نمایش گزارش روزانه ناهار برای این کاربر
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t bg-muted/10 px-5 py-4">
            <Button className="w-full sm:w-auto" type="submit">
              <Save className="h-4 w-4" aria-hidden="true" />
              ذخیره تغییرات
            </Button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">تیم‌ها</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            عضویت‌های تیمی این کاربر را مدیریت کنید.
          </p>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] lg:items-start">
          <div className="grid content-start gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-950">
                تیم‌های اختصاص‌یافته
              </h3>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {user.teamMemberships.length.toLocaleString("fa-IR")} تیم
              </span>
            </div>
            {user.teamMemberships.length === 0 ? (
              <div className="rounded-md border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
                این کاربر هنوز عضو هیچ تیمی نیست.
              </div>
            ) : (
              <div className="grid gap-2">
                {user.teamMemberships.map((membership) => (
                  <div
                    className="flex flex-col gap-3 rounded-md border bg-background p-3 transition-colors hover:border-slate-300 sm:flex-row sm:items-center sm:justify-between"
                    key={membership.id}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-slate-600">
                        <Users className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {membership.team.name}
                        </p>
                      </div>
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
                        type="submit"
                        variant="outline"
                      >
                        <UserMinus className="h-4 w-4" aria-hidden="true" />
                        حذف از تیم
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid content-start gap-4 rounded-md border bg-muted/20 p-4">
            <div className="grid gap-1">
              <h3 className="text-sm font-semibold text-slate-950">
                افزودن به تیم
              </h3>
              <p className="text-xs leading-5 text-muted-foreground">
                عضویت جدید برای این کاربر
              </p>
            </div>
            {availableTeams.length === 0 ? (
              <p className="rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">
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
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  افزودن به تیم
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">رمز موقت</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            یک رمز جدید برای ورود بعدی کاربر تنظیم کنید.
          </p>
        </div>

        <form
          action={resetUserPasswordAction}
          className="grid gap-2 p-5"
        >
          <input name="redirectPath" type="hidden" value={redirectPath} />
          <input name="userId" type="hidden" value={user.id} />
          <FieldLabel htmlFor="user-password">رمز موقت جدید</FieldLabel>
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto]">
            <TextInput
              dir="ltr"
              id="user-password"
              minLength={8}
              name="password"
              required
              type="password"
            />
            <Button className="w-full md:w-auto" type="submit">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              تنظیم رمز موقت
            </Button>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            حداقل ۸ کاراکتر
          </p>
        </form>
      </section>

      {!isCurrentAdmin ? (
        <section
          aria-labelledby="danger-zone-title"
          className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm"
        >
          <div className="border-b px-5 py-4">
            <h2
              className="text-base font-semibold text-red-800"
              id="danger-zone-title"
            >
              محدوده خطر
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              اقدامات این بخش بر دسترسی کاربر اثر مستقیم دارند.
            </p>
          </div>

          <div className="p-5">
            <div className="flex flex-col gap-4 rounded-md border border-red-200/80 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid gap-1">
                <h3 className="text-sm font-semibold text-slate-950">
                  حذف کاربر
                </h3>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  حساب غیرفعال و از فهرست کاربران پنهان می‌شود. رزروها و
                  تاریخچه تغییرات برای گزارش‌گیری باقی می‌مانند.
                </p>
              </div>

              <form action={deleteUserAction} className="shrink-0">
                <input name="redirectPath" type="hidden" value={redirectPath} />
                <input name="userId" type="hidden" value={user.id} />
                <Button
                  className="w-full border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 sm:w-auto"
                  type="submit"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  حذف کاربر
                </Button>
              </form>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
