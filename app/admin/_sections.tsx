import Link from "next/link";
import {
  CalendarDays,
  CalendarCheck2,
  CalendarPlus,
  CalendarX2,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  Mail,
  Plus,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import { UserRole } from "@prisma/client";
import type { ReactNode } from "react";

import {
  createCapacityExceptionAction,
  createScheduleExceptionAction,
  deleteCapacityExceptionAction,
  deleteScheduleExceptionAction,
  importIranHolidaysAction,
  updateCapacityExceptionAction,
  updateReservationPolicyAction,
  updateResourcePoolAction,
  updateScheduleExceptionAction,
  updateWeeklyScheduleAction,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import {
  JALALI_DATE_INPUT_PLACEHOLDER,
  formatJalaliDate,
} from "@/lib/jalali-date";

type AdminPageProps = {
  searchParams?: Promise<{
    tab?: string;
    error?: string;
    capacityExceptionCreated?: string;
    capacityExceptionDeleted?: string;
    capacityExceptionUpdated?: string;
    exceptionCreated?: string;
    exceptionDeleted?: string;
    exceptionUpdated?: string;
    holidayImported?: string;
    passwordReset?: string;
    poolUpdated?: string;
    reservationPolicyUpdated?: string;
    scheduleUpdated?: string;
    userCreated?: string;
    userDeleted?: string;
    userUpdated?: string;
  }>;
};

type AdminTab = "users" | "capacity" | "schedule";

export const ADMIN_PAGE_LABELS: Record<AdminTab, string> = {
  users: "کاربران",
  capacity: "ظرفیت",
  schedule: "زمان‌بندی",
};

const DAY_LABELS: Record<number, string> = {
  0: "یک شنبه",
  1: "دو شنبه",
  2: "سه شنبه",
  3: "چهار شنبه",
  4: "پنج شنبه",
  5: "جمعه",
  6: "شنبه",
};

const PERSIAN_WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];
const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR");

const USER_ROLE_LABELS: Record<UserRole, string> = {
  USER: "کاربر",
  MANAGER: "مدیر",
  ADMIN: "ادمین",
};

const USER_ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  USER: "ثبت و پیگیری رزروهای خودش",
  MANAGER: "بررسی، تایید و رد درخواست‌ها",
  ADMIN: "دسترسی کامل به تنظیمات و کاربران",
};

function formatPersianNumber(value: number): string {
  return PERSIAN_NUMBER_FORMATTER.format(value);
}

function formatPersianTime(value: string | null | undefined): string {
  if (!value) {
    return "نامشخص";
  }

  const [hour = "0", minute = "0"] = value.split(":");

  return `${formatPersianNumber(Number(hour)).padStart(2, "۰")}:${formatPersianNumber(
    Number(minute),
  ).padStart(2, "۰")}`;
}

function formatWorkingWindow(input: {
  isWorkingDay: boolean;
  startTime: string | null;
  endTime: string | null;
}): string {
  if (!input.isWorkingDay) {
    return "تعطیل";
  }

  return `${formatPersianTime(input.startTime)} تا ${formatPersianTime(input.endTime)}`;
}

function getUserRoleBadgeClass(role: UserRole): string {
  if (role === UserRole.ADMIN) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (role === UserRole.MANAGER) {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function getAdminToast(params: Awaited<AdminPageProps["searchParams"]>) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  const successMessage =
    (params?.poolUpdated && "Resource pool settings updated.") ||
    (params?.reservationPolicyUpdated && "Reservation policy updated.") ||
    (params?.capacityExceptionCreated && "Daily capacity exception created.") ||
    (params?.capacityExceptionUpdated && "Daily capacity exception updated.") ||
    (params?.capacityExceptionDeleted && "Daily capacity exception deleted.") ||
    (params?.scheduleUpdated && "Weekly schedule updated.") ||
    (params?.exceptionCreated && "Schedule exception created.") ||
    (params?.exceptionUpdated && "Schedule exception updated.") ||
    (params?.exceptionDeleted && "Schedule exception deleted.") ||
    (params?.holidayImported &&
      `${params.holidayImported} Iran holiday schedule exceptions imported.`) ||
    (params?.userCreated && "User created.") ||
    (params?.userDeleted && "User deleted.") ||
    (params?.userUpdated && "User updated.") ||
    (params?.passwordReset && "Temporary password set.");

  if (!successMessage) {
    return null;
  }

  return {
    consumeKeys: [
      "poolUpdated",
      "reservationPolicyUpdated",
      "capacityExceptionCreated",
      "capacityExceptionUpdated",
      "capacityExceptionDeleted",
      "scheduleUpdated",
      "exceptionCreated",
      "exceptionUpdated",
      "exceptionDeleted",
      "holidayImported",
      "userCreated",
      "userDeleted",
      "userUpdated",
      "passwordReset",
    ],
    message: successMessage,
    variant: "success" as const,
  };
}

function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <label className="text-sm font-medium" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

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

export function ResourcePoolSettings({
  resourcePools,
}: {
  resourcePools: Array<{
    id: string;
    name: string;
    capacity: number;
    active: boolean;
  }>;
}) {
  const activePools = resourcePools.filter((pool) => pool.active);
  const totalActiveCapacity = activePools.reduce(
    (sum, pool) => sum + pool.capacity,
    0,
  );
  const inactivePools = resourcePools.length - activePools.length;

  return (
    <section className="grid gap-5 text-card-foreground" dir="rtl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-slate-950">
            ظرفیت پایه سیستم‌ها
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Nobino سیستم‌ها را به عنوان یک مخزن ظرفیت مدیریت می‌کند. کاهش
            ظرفیت فقط وقتی ذخیره می‌شود که رزروهای تاییدشده آینده از مقدار
            جدید بیشتر نباشند.
          </p>
        </div>
      </div>

      {resourcePools.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
          هنوز مخزن ظرفیتی تعریف نشده است.
        </div>
      ) : (
        <div className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  ظرفیت فعال
                </p>
                <Gauge className="h-4 w-4 text-emerald-700" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-emerald-700">
                {formatPersianNumber(totalActiveCapacity)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  مخزن فعال
                </p>
                <Database className="h-4 w-4 text-blue-700" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-blue-700">
                {formatPersianNumber(activePools.length)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  غیرفعال
                </p>
                <CheckCircle2 className="h-4 w-4 text-slate-500" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-700">
                {formatPersianNumber(inactivePools)}
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {resourcePools.map((pool) => (
              <form
                action={updateResourcePoolAction}
                className="rounded-lg border bg-card p-4 shadow-sm"
                key={pool.id}
              >
                <input name="resourcePoolId" type="hidden" value={pool.id} />
                <div className="grid gap-4 lg:grid-cols-[1fr_150px_160px_auto] lg:items-end">
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          pool.active ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      />
                      <FieldLabel htmlFor={`pool-name-${pool.id}`}>
                        نام مخزن
                      </FieldLabel>
                    </div>
                    <TextInput
                      defaultValue={pool.name}
                      id={`pool-name-${pool.id}`}
                      maxLength={100}
                      name="name"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel htmlFor={`pool-capacity-${pool.id}`}>
                      ظرفیت همزمان
                    </FieldLabel>
                    <TextInput
                      defaultValue={pool.capacity}
                      id={`pool-capacity-${pool.id}`}
                      inputMode="numeric"
                      max={50}
                      min={1}
                      name="capacity"
                      required
                      type="number"
                    />
                  </div>
                  <label className="flex min-h-10 items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                    <span>فعال باشد</span>
                    <input
                      className="h-4 w-4 rounded border-input"
                      defaultChecked={pool.active}
                      name="active"
                      type="checkbox"
                    />
                  </label>
                  <Button className="w-full lg:w-auto" type="submit">
                    <Save className="h-4 w-4" />
                    ذخیره
                  </Button>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  فقط رزروهای تاییدشده ظرفیت را مصرف می‌کنند؛ درخواست‌های در
                  انتظار در تقویم دیده می‌شوند اما جلوی درخواست جدید را
                  نمی‌گیرند.
                </p>
              </form>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function ReservationPolicySettings({
  dailyUserHourLimit,
  oneReservationPerDayEnabled,
}: {
  dailyUserHourLimit: number;
  oneReservationPerDayEnabled: boolean;
}) {
  return (
    <section className="grid gap-5 text-card-foreground" dir="rtl">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-slate-950">
          سیاست رزرو کاربران
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          این محدودیت‌ها قبل از ثبت درخواست بررسی می‌شوند تا هر کاربر در یک
          روز بیشتر از سقف مجاز، زمان رزرو نکند.
        </p>
      </div>

      <form
        action={updateReservationPolicyAction}
        className="rounded-lg border bg-card p-4 shadow-sm"
      >
        <div className="grid gap-4 lg:grid-cols-[220px_1fr_auto] lg:items-end">
          <div className="grid gap-2">
            <FieldLabel htmlFor="daily-user-hour-limit">
              سقف ساعت روزانه هر کاربر
            </FieldLabel>
            <TextInput
              defaultValue={dailyUserHourLimit}
              id="daily-user-hour-limit"
              inputMode="numeric"
              max={24}
              min={1}
              name="dailyUserHourLimit"
              required
              type="number"
            />
          </div>
          <label className="flex min-h-10 items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
            <span>هر کاربر در هر روز فقط یک رزرو داشته باشد</span>
            <input
              className="h-4 w-4 rounded border-input"
              defaultChecked={oneReservationPerDayEnabled}
              name="oneReservationPerDayEnabled"
              type="checkbox"
            />
          </label>
          <Button className="w-full lg:w-auto" type="submit">
            <Save className="h-4 w-4" />
            ذخیره سیاست
          </Button>
        </div>
      </form>
    </section>
  );
}

export function CapacityExceptions({
  capacityExceptions,
  resourcePools,
}: {
  capacityExceptions: Array<{
    id: string;
    date: Date;
    capacity: number;
    reason: string | null;
    resourcePool: {
      id: string;
      name: string;
      capacity: number;
    };
  }>;
  resourcePools: Array<{
    id: string;
    name: string;
    capacity: number;
    active: boolean;
  }>;
}) {
  const hasResourcePools = resourcePools.length > 0;

  return (
    <section className="grid gap-5 text-card-foreground" dir="rtl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-slate-950">
            استثناهای ظرفیت روزانه
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            برای تاریخ‌های خاص مثل تعمیرات یا کاهش موقت سیستم‌ها، ظرفیت همان
            روز را با تاریخ جلالی تغییر دهید. مقدار جدید باید رزروهای
            تاییدشده همان روز را پوشش دهد.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          <span>{formatPersianNumber(capacityExceptions.length)} استثنا</span>
        </div>
      </div>

      <form
        action={createCapacityExceptionAction}
        className="rounded-lg border bg-card p-4 shadow-sm"
      >
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-950">
          <Plus className="h-4 w-4 text-primary" />
          <span>ثبت استثنای جدید</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_170px_140px_1fr_auto] lg:items-end">
          <div className="grid gap-2">
            <FieldLabel htmlFor="capacity-exception-pool">مخزن</FieldLabel>
            <SelectInput
              disabled={!hasResourcePools}
              id="capacity-exception-pool"
              name="resourcePoolId"
            >
              {resourcePools.map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.name}، پیش‌فرض {formatPersianNumber(pool.capacity)}
                </option>
              ))}
            </SelectInput>
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="capacity-exception-date">
              تاریخ جلالی
            </FieldLabel>
            <TextInput
              id="capacity-exception-date"
              name="date"
              placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
              required
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="capacity-exception-capacity">
              ظرفیت همان روز
            </FieldLabel>
            <TextInput
              id="capacity-exception-capacity"
              inputMode="numeric"
              max={50}
              min={0}
              name="capacity"
              required
              type="number"
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="capacity-exception-reason">دلیل</FieldLabel>
            <TextInput
              id="capacity-exception-reason"
              maxLength={200}
              name="reason"
              placeholder="تعمیر، سرویس دوره‌ای یا تغییر موقت ظرفیت"
            />
          </div>
          <Button
            className="w-full lg:w-auto"
            disabled={!hasResourcePools}
            type="submit"
          >
            <Plus className="h-4 w-4" />
            ثبت
          </Button>
        </div>
      </form>

      {capacityExceptions.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
          هیچ استثنای ظرفیتی ثبت نشده است.
        </div>
      ) : (
        <div className="grid gap-3">
          {capacityExceptions.map((exception) => (
            <form
              action={updateCapacityExceptionAction}
              className="rounded-lg border bg-card p-4 shadow-sm"
              key={exception.id}
            >
              <input
                name="capacityExceptionId"
                type="hidden"
                value={exception.id}
              />
              <div className="grid gap-4 lg:grid-cols-[minmax(180px,0.9fr)_140px_1fr_auto_auto] lg:items-end">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-500" />
                    <p className="truncate font-medium text-slate-950">
                      {exception.resourcePool.name}
                    </p>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {formatJalaliDate(exception.date)}، پیش‌فرض{" "}
                    {formatPersianNumber(exception.resourcePool.capacity)}
                  </p>
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor={`capacity-exception-value-${exception.id}`}
                  >
                    ظرفیت
                  </FieldLabel>
                  <TextInput
                    defaultValue={exception.capacity}
                    id={`capacity-exception-value-${exception.id}`}
                    inputMode="numeric"
                    max={50}
                    min={0}
                    name="capacity"
                    required
                    type="number"
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor={`capacity-exception-reason-${exception.id}`}
                  >
                    دلیل
                  </FieldLabel>
                  <TextInput
                    defaultValue={exception.reason ?? ""}
                    id={`capacity-exception-reason-${exception.id}`}
                    maxLength={200}
                    name="reason"
                    placeholder="بدون توضیح"
                  />
                </div>
                <Button className="w-full lg:w-auto" type="submit">
                  <Save className="h-4 w-4" />
                  ذخیره
                </Button>
                <Button
                  className="w-full lg:w-auto"
                  formAction={deleteCapacityExceptionAction}
                  type="submit"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4" />
                  حذف
                </Button>
              </div>
            </form>
          ))}
        </div>
      )}
    </section>
  );
}

export function WeeklyScheduleSettings({
  schedules,
}: {
  schedules: Array<{
    id: string;
    dayOfWeek: number;
    isWorkingDay: boolean;
    startTime: string;
    endTime: string;
  }>;
}) {
  const sortedSchedules = [...schedules].sort(
    (left, right) =>
      PERSIAN_WEEK_ORDER.indexOf(left.dayOfWeek) -
      PERSIAN_WEEK_ORDER.indexOf(right.dayOfWeek),
  );
  const workingDays = schedules.filter((schedule) => schedule.isWorkingDay);
  const disabledDays = schedules.length - workingDays.length;

  return (
    <section className="grid gap-5 text-card-foreground" dir="rtl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-slate-950">
            برنامه هفتگی کاری
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            این برنامه پایه تقویم رزرو است. هر تغییر روی درخواست‌های جدید اثر
            می‌گذارد و ساعت‌ها باید دقیقاً روی ابتدای ساعت باشند.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <div className="inline-flex items-center gap-2 rounded-md border bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <CalendarCheck2 className="h-4 w-4" />
            <span>{formatPersianNumber(workingDays.length)} روز کاری</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <CalendarX2 className="h-4 w-4" />
            <span>{formatPersianNumber(disabledDays)} روز تعطیل</span>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {sortedSchedules.map((schedule) => (
          <form
            action={updateWeeklyScheduleAction}
            className="rounded-lg border bg-card p-4 shadow-sm"
            key={schedule.id}
          >
            <input name="scheduleId" type="hidden" value={schedule.id} />
            <div className="grid gap-4 lg:grid-cols-[minmax(160px,0.8fr)_140px_140px_160px_auto] lg:items-end">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      schedule.isWorkingDay ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  />
                  <p className="font-medium text-slate-950">
                    {DAY_LABELS[schedule.dayOfWeek] ??
                      `روز ${formatPersianNumber(schedule.dayOfWeek)}`}
                  </p>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs leading-5 text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" />
                  {formatWorkingWindow(schedule)}
                </p>
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor={`weekly-start-${schedule.id}`}>
                  شروع
                </FieldLabel>
                <TextInput
                  defaultValue={schedule.startTime}
                  id={`weekly-start-${schedule.id}`}
                  name="startTime"
                  pattern="([01]\d|2[0-3]):00"
                  placeholder="09:00"
                />
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor={`weekly-end-${schedule.id}`}>
                  پایان
                </FieldLabel>
                <TextInput
                  defaultValue={schedule.endTime}
                  id={`weekly-end-${schedule.id}`}
                  name="endTime"
                  pattern="([01]\d|2[0-3]):00"
                  placeholder="17:00"
                />
              </div>
              <label className="flex min-h-10 items-center gap-2 text-sm lg:justify-center">
                <span>روز کاری باشد</span>
                <input
                  className="h-4 w-4 rounded border-input"
                  defaultChecked={schedule.isWorkingDay}
                  name="isWorkingDay"
                  type="checkbox"
                />
              </label>
              <Button className="w-full lg:w-auto" type="submit">
                <Save className="h-4 w-4" />
                ذخیره
              </Button>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              برای روزهای تعطیل، ساعت‌ها در رزرو اعمال نمی‌شوند اما مقدارشان
              برای فعال‌سازی دوباره نگه داشته می‌شود.
            </p>
          </form>
        ))}
      </div>
    </section>
  );
}

export function ScheduleExceptions({
  currentJalaliYear,
  exceptions,
}: {
  currentJalaliYear: string;
  exceptions: Array<{
    id: string;
    date: Date;
    isWorkingDay: boolean;
    startTime: string | null;
    endTime: string | null;
    reason: string | null;
  }>;
}) {
  const workingExceptions = exceptions.filter(
    (exception) => exception.isWorkingDay,
  ).length;
  const disabledExceptions = exceptions.length - workingExceptions;

  return (
    <section className="grid gap-5 text-card-foreground" dir="rtl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-slate-950">
            استثناهای تاریخ‌محور
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            هر استثنا فقط برای یک تاریخ جلالی است و برنامه هفتگی همان روز را
            جایگزین می‌کند؛ برای تعطیلی کامل، گزینه روز کاری را خاموش کنید.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          <span>{formatPersianNumber(exceptions.length)} استثنا</span>
        </div>
      </div>

      <form
        action={importIranHolidaysAction}
        className="rounded-lg border bg-card p-4 shadow-sm"
      >
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-950">
          <CalendarPlus className="h-4 w-4 text-primary" />
          <span>ورود تعطیلی‌های رسمی ایران</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-[160px_1fr_auto] sm:items-end">
          <div className="grid gap-2">
            <FieldLabel htmlFor="iran-holiday-year">سال جلالی</FieldLabel>
            <TextInput
              defaultValue={currentJalaliYear}
              id="iran-holiday-year"
              inputMode="numeric"
              max="1600"
              min="1300"
              name="year"
              required
              type="number"
            />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            تعطیلی‌های رسمی سال انتخاب‌شده به‌صورت استثنای تعطیل ثبت می‌شوند و
            استثناهای موجود تکراری ساخته نمی‌شوند.
          </p>
          <Button className="w-full sm:w-auto" type="submit">
            <CalendarPlus className="h-4 w-4" />
            ورود تعطیلی‌ها
          </Button>
        </div>
      </form>

      <form
        action={createScheduleExceptionAction}
        className="rounded-lg border bg-card p-4 shadow-sm"
      >
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-950">
          <Plus className="h-4 w-4 text-primary" />
          <span>ثبت استثنای جدید</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[150px_120px_120px_1fr_160px_auto] lg:items-end">
          <div className="grid gap-2">
            <FieldLabel htmlFor="exception-date">تاریخ جلالی</FieldLabel>
            <TextInput
              id="exception-date"
              name="date"
              placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
              required
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="exception-start">شروع</FieldLabel>
            <TextInput
              id="exception-start"
              name="startTime"
              pattern="([01]\d|2[0-3]):00"
              placeholder="09:00"
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="exception-end">پایان</FieldLabel>
            <TextInput
              id="exception-end"
              name="endTime"
              pattern="([01]\d|2[0-3]):00"
              placeholder="17:00"
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="exception-reason">دلیل</FieldLabel>
            <TextInput
              id="exception-reason"
              maxLength={200}
              name="reason"
              placeholder="تعطیلی رسمی، سرویس دوره‌ای یا ساعت ویژه"
            />
          </div>
          <label className="flex min-h-10 items-center gap-2 text-sm lg:justify-center">
            <span>روز کاری باشد</span>
            <input
              className="h-4 w-4 rounded border-input"
              defaultChecked
              name="isWorkingDay"
              type="checkbox"
            />
          </label>
          <Button className="w-full lg:w-auto" type="submit">
            <Plus className="h-4 w-4" />
            ثبت
          </Button>
        </div>
      </form>

      {exceptions.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
          هنوز استثنای تاریخ‌محور ثبت نشده است.
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  روز کاری ویژه
                </p>
                <CalendarCheck2 className="h-4 w-4 text-emerald-700" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-emerald-700">
                {formatPersianNumber(workingExceptions)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  تعطیلی ویژه
                </p>
                <CalendarX2 className="h-4 w-4 text-slate-500" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-700">
                {formatPersianNumber(disabledExceptions)}
              </p>
            </div>
          </div>
          {exceptions.map((exception) => (
            <form
              action={updateScheduleExceptionAction}
              className="rounded-lg border bg-card p-4 shadow-sm"
              key={exception.id}
            >
              <input name="exceptionId" type="hidden" value={exception.id} />
              <div className="grid gap-4 lg:grid-cols-[minmax(210px,0.9fr)_120px_120px_1fr_160px_auto_auto] lg:items-end">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        exception.isWorkingDay ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                    />
                    <p className="truncate font-medium text-slate-950">
                      {formatJalaliDate(exception.date)}
                    </p>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs leading-5 text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatWorkingWindow(exception)}
                  </p>
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor={`exception-start-${exception.id}`}>
                    شروع
                  </FieldLabel>
                  <TextInput
                    defaultValue={exception.startTime ?? ""}
                    id={`exception-start-${exception.id}`}
                    name="startTime"
                    pattern="([01]\d|2[0-3]):00"
                    placeholder="09:00"
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor={`exception-end-${exception.id}`}>
                    پایان
                  </FieldLabel>
                  <TextInput
                    defaultValue={exception.endTime ?? ""}
                    id={`exception-end-${exception.id}`}
                    name="endTime"
                    pattern="([01]\d|2[0-3]):00"
                    placeholder="17:00"
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor={`exception-reason-${exception.id}`}>
                    دلیل
                  </FieldLabel>
                  <TextInput
                    defaultValue={exception.reason ?? ""}
                    id={`exception-reason-${exception.id}`}
                    maxLength={200}
                    name="reason"
                    placeholder="بدون توضیح"
                  />
                </div>
                <label className="flex min-h-10 items-center gap-2 text-sm lg:justify-center">
                  <span>روز کاری باشد</span>
                  <input
                    className="h-4 w-4 rounded border-input"
                    defaultChecked={exception.isWorkingDay}
                    name="isWorkingDay"
                    type="checkbox"
                  />
                </label>
                <Button className="w-full lg:w-auto" type="submit">
                  <Save className="h-4 w-4" />
                  ذخیره
                </Button>
                <Button
                  className="w-full lg:w-auto"
                  formAction={deleteScheduleExceptionAction}
                  type="submit"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4" />
                  حذف
                </Button>
              </div>
            </form>
          ))}
        </div>
      )}
    </section>
  );
}
