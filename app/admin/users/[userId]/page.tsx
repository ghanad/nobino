/**
 * DIRECTION CONTRACT — «نوار هویت و دو ستون» (seed key 80dbb3bf, dealt structure 7)
 * THESIS: پرونده پرسنلی، نه پشته‌ای از بیلبوردهای هم‌اندازه؛ هویت در یک نوار باریک خلاصه
 *   می‌شود و کارها در دو ستون نامتقارن جریان می‌یابند. رد می‌کند: چهار کارت تمام‌عرض هم‌اندازه.
 * OWN-WORLD: «میز خدمت آرام» (DESIGN.md) — سفید، خط نازک آبی‌خاکستری، آبی فقط برای کنش،
 *   تخت در حالت سکون، ورودی‌ها به‌اندازه محتوا نه تمام‌عرض.
 * STORY: ادمین در یک نگاه هویت و وضعیت را می‌خواند، در ستون اصلی ویرایش و رمز را انجام می‌دهد
 *   و در ستون کناری چسبان، تیم‌ها و محدوده خطر را مدیریت می‌کند.
 * FIRST VIEWPORT: سربرگ + نوار هویت (نشان‌ها، ایمیل، تاریخ ساخت) + ستون اصلی (فرم پروفایل و
 *   دسترسی‌ها با ردیف‌های فشرده) و ستون کناری (تیم‌ها، حذف کاربر).
 * FORM: dealt structure 7 «identity-split».
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronRight,
  KeyRound,
  Mail,
  Save,
  Trash2,
  UserMinus,
  UserPlus,
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
        canCreateSurveys: true,
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
    <div className="grid gap-4" dir="rtl">
      <PageHeader
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/users">
              <ChevronRight className="h-4 w-4" />
              بازگشت به کاربران
            </Link>
          </Button>
        }
        subtitle="مدیریت نقش، دسترسی‌ها، تیم‌ها و رمز موقت کاربر"
        title={user.name}
      />

      <UserManagementToast params={resolvedSearchParams} />

      <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm">
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
        <span
          aria-hidden="true"
          className="hidden h-4 w-px bg-border sm:block"
        />
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span dir="ltr">{user.email}</span>
        </span>
        <span
          aria-hidden="true"
          className="hidden h-4 w-px bg-border sm:block"
        />
        <span className="text-muted-foreground">
          ساخته شده در{" "}
          <span className="font-medium text-slate-700">
            {formatJalaliDate(user.createdAt)}
          </span>
        </span>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-4">
          <section className="overflow-hidden rounded-lg border bg-card text-card-foreground">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-950">
                مشخصات و دسترسی
              </h2>
            </div>

            <form action={updateUserAction}>
              <input name="redirectPath" type="hidden" value={redirectPath} />
              <input name="userId" type="hidden" value={user.id} />

              <div className="grid gap-4 p-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_minmax(200px,240px)]">
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
                </div>

                <div className="grid content-start gap-2">
                  <FieldLabel htmlFor="user-role">نقش</FieldLabel>
                  <div className="grid max-w-xs">
                    <SelectInput
                      defaultValue={user.role}
                      id="user-role"
                      name="role"
                    >
                      <UserRoleOptions />
                    </SelectInput>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {USER_ROLE_DESCRIPTIONS[user.role]}
                  </p>
                </div>

                <fieldset className="grid gap-0 border-t pt-3">
                  <legend className="mb-1 text-sm font-semibold text-slate-950">
                    دسترسی‌های تکمیلی
                  </legend>

                  <label className="flex items-start gap-2.5 border-b py-2.5 text-sm">
                    {isCurrentAdmin ? (
                      <input name="active" type="hidden" value="on" />
                    ) : null}
                    <input
                      className="mt-1 h-4 w-4 shrink-0 rounded border-input outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      defaultChecked={user.active}
                      disabled={isCurrentAdmin}
                      name="active"
                      type="checkbox"
                    />
                    <span className="grid gap-0.5">
                      <span className="font-medium text-slate-900">
                        حساب فعال باشد
                      </span>
                      <span className="text-xs font-normal leading-5 text-muted-foreground">
                        {isCurrentAdmin
                          ? "حساب خودتان از این صفحه غیرفعال نمی‌شود."
                          : "کاربر امکان ورود و استفاده از سامانه را داشته باشد."}
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 border-b py-2.5 text-sm">
                    <input
                      className="mt-1 h-4 w-4 shrink-0 rounded border-input outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      defaultChecked={user.canViewLunchReport}
                      name="canViewLunchReport"
                      type="checkbox"
                    />
                    <span className="grid gap-0.5">
                      <span className="font-medium text-slate-900">
                        دسترسی گزارش غذا
                      </span>
                      <span className="text-xs font-normal leading-5 text-muted-foreground">
                        نمایش گزارش روزانه غذا برای این کاربر
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 py-2.5 text-sm">
                    <input
                      className="mt-1 h-4 w-4 shrink-0 rounded border-input outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      defaultChecked={user.canCreateSurveys}
                      name="canCreateSurveys"
                      type="checkbox"
                    />
                    <span className="grid gap-0.5">
                      <span className="font-medium text-slate-900">
                        امکان ساخت نظرسنجی
                      </span>
                      <span className="text-xs font-normal leading-5 text-muted-foreground">
                        اجازه ایجاد و انتشار نظرسنجی‌های داخلی
                      </span>
                    </span>
                  </label>
                </fieldset>
              </div>

              <div className="flex justify-end border-t bg-muted/10 px-4 py-3">
                <Button size="sm" type="submit">
                  <Save aria-hidden="true" className="h-4 w-4" />
                  ذخیره تغییرات
                </Button>
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-lg border bg-card text-card-foreground">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-950">رمز موقت</h2>
            </div>

            <form action={resetUserPasswordAction} className="grid gap-2 p-4">
              <input name="redirectPath" type="hidden" value={redirectPath} />
              <input name="userId" type="hidden" value={user.id} />
              <FieldLabel htmlFor="user-password">رمز موقت جدید</FieldLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="grid w-full sm:w-72">
                  <TextInput
                    dir="ltr"
                    id="user-password"
                    minLength={8}
                    name="password"
                    required
                    type="password"
                  />
                </div>
                <Button size="sm" type="submit">
                  <KeyRound aria-hidden="true" className="h-4 w-4" />
                  تنظیم رمز موقت
                </Button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                حداقل ۸ کاراکتر؛ در ورود بعدی کاربر استفاده می‌شود.
              </p>
            </form>
          </section>
        </div>

        <div className="grid content-start gap-4 lg:sticky lg:top-6 lg:self-start">
          <section className="overflow-hidden rounded-lg border bg-card text-card-foreground">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-950">تیم‌ها</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {user.teamMemberships.length.toLocaleString("fa-IR")} تیم
              </span>
            </div>

            <div className="grid gap-3 p-4">
              {user.teamMemberships.length === 0 ? (
                <p className="rounded-md border border-dashed bg-muted/10 p-3 text-sm text-muted-foreground">
                  این کاربر هنوز عضو هیچ تیمی نیست.
                </p>
              ) : (
                <div className="grid gap-1.5">
                  {user.teamMemberships.map((membership) => (
                    <div
                      className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 transition-colors hover:border-slate-300"
                      key={membership.id}
                    >
                      <span className="truncate text-sm font-medium text-slate-900">
                        {membership.team.name}
                      </span>
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
                          aria-label={`حذف از تیم ${membership.team.name}`}
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-700"
                          size="icon"
                          title="حذف از تیم"
                          type="submit"
                          variant="ghost"
                        >
                          <UserMinus aria-hidden="true" className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  ))}
                </div>
              )}

              {availableTeams.length === 0 ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  تیم دیگری برای افزودن وجود ندارد.
                </p>
              ) : (
                <form action={addTeamMemberAction} className="grid gap-2 border-t pt-3">
                  <input
                    name="redirectPath"
                    type="hidden"
                    value={redirectPath}
                  />
                  <input name="userId" type="hidden" value={user.id} />
                  <FieldLabel htmlFor="user-team">افزودن به تیم</FieldLabel>
                  <div className="flex flex-col gap-2">
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
                    <Button size="sm" type="submit">
                      <UserPlus aria-hidden="true" className="h-4 w-4" />
                      افزودن
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </section>

          {!isCurrentAdmin ? (
            <section
              aria-labelledby="danger-zone-title"
              className="overflow-hidden rounded-lg border border-red-200/80 bg-card text-card-foreground"
            >
              <div className="border-b border-red-200/60 px-4 py-3">
                <h2
                  className="text-sm font-semibold text-red-800"
                  id="danger-zone-title"
                >
                  محدوده خطر
                </h2>
              </div>

              <div className="grid gap-3 p-4">
                <p className="text-xs leading-5 text-muted-foreground">
                  حساب غیرفعال و از فهرست کاربران پنهان می‌شود. رزروها و
                  تاریخچه تغییرات برای گزارش‌گیری باقی می‌مانند.
                </p>
                <form action={deleteUserAction}>
                  <input name="redirectPath" type="hidden" value={redirectPath} />
                  <input name="userId" type="hidden" value={user.id} />
                  <Button
                    className="w-full border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                    size="sm"
                    type="submit"
                    variant="outline"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    حذف کاربر
                  </Button>
                </form>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
