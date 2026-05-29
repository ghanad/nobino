import Link from "next/link";
import {
  Mail,
  Save,
  ShieldCheck,
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
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

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
  return (
    <section className="rounded-lg border bg-card p-5 text-card-foreground">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">Resource pools</h2>
        <p className="text-sm text-muted-foreground">
          Capacity reductions are blocked when future approved reservations
          already exceed the requested value.
        </p>
      </div>

      {resourcePools.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          No resource pools are configured.
        </p>
      ) : (
        <div className="mt-5 grid gap-4">
          {resourcePools.map((pool) => (
            <form
              action={updateResourcePoolAction}
              className="grid gap-4 rounded-md border bg-muted/20 p-4 lg:grid-cols-[1fr_140px_auto]"
              key={pool.id}
            >
              <input name="resourcePoolId" type="hidden" value={pool.id} />
              <div className="grid gap-2">
                <FieldLabel htmlFor={`pool-name-${pool.id}`}>Name</FieldLabel>
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
                  Capacity
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
              <div className="flex flex-col justify-end gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    className="h-4 w-4 rounded border-input"
                    defaultChecked={pool.active}
                    name="active"
                    type="checkbox"
                  />
                  Active
                </label>
                <Button type="submit">
                  <Save className="h-4 w-4" />
                  Save
                </Button>
              </div>
            </form>
          ))}
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
    <section className="rounded-lg border bg-card p-5 text-card-foreground">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">Reservation policy</h2>
        <p className="text-sm text-muted-foreground">
          Limit how many approved or pending hours each user can hold on one day.
        </p>
      </div>

      <form
        action={updateReservationPolicyAction}
        className="mt-5 grid gap-4 rounded-md border bg-muted/20 p-4 sm:grid-cols-[180px_minmax(220px,1fr)_auto] sm:items-end"
      >
        <div className="grid gap-2">
          <FieldLabel htmlFor="daily-user-hour-limit">
            Daily user hours
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
        <label className="flex min-h-10 items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm">
          <input
            className="h-4 w-4 rounded border-input"
            defaultChecked={oneReservationPerDayEnabled}
            name="oneReservationPerDayEnabled"
            type="checkbox"
          />
          <span>Only one reservation per user per day</span>
        </label>
        <div className="flex items-end">
          <Button type="submit">
            <Save className="h-4 w-4" />
            Save
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
  return (
    <section className="rounded-lg border bg-card p-5 text-card-foreground">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">Daily capacity exceptions</h2>
        <p className="text-sm text-muted-foreground">
          Override capacity for a specific Jalali date when systems are out for
          repair. Existing approved reservations must still fit the new value.
        </p>
      </div>

      <form
        action={createCapacityExceptionAction}
        className="mt-5 grid gap-4 rounded-md border bg-muted/20 p-4 lg:grid-cols-[1fr_150px_120px_1fr_auto]"
      >
        <div className="grid gap-2">
          <FieldLabel htmlFor="capacity-exception-pool">Pool</FieldLabel>
          <SelectInput id="capacity-exception-pool" name="resourcePoolId">
            {resourcePools.map((pool) => (
              <option key={pool.id} value={pool.id}>
                {pool.name} default {pool.capacity}
              </option>
            ))}
          </SelectInput>
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="capacity-exception-date">Jalali date</FieldLabel>
          <TextInput
            id="capacity-exception-date"
            name="date"
            placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
            required
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="capacity-exception-capacity">
            Capacity
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
          <FieldLabel htmlFor="capacity-exception-reason">Reason</FieldLabel>
          <TextInput
            id="capacity-exception-reason"
            maxLength={200}
            name="reason"
            placeholder="Repair, maintenance, or temporary capacity change"
          />
        </div>
        <div className="flex items-end">
          <Button type="submit">Create</Button>
        </div>
      </form>

      {capacityExceptions.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          No daily capacity exceptions are configured.
        </p>
      ) : (
        <div className="mt-5 grid gap-3">
          {capacityExceptions.map((exception) => (
            <form
              action={updateCapacityExceptionAction}
              className="grid gap-4 rounded-md border bg-muted/20 p-4 lg:grid-cols-[220px_120px_1fr_auto_auto]"
              key={exception.id}
            >
              <input
                name="capacityExceptionId"
                type="hidden"
                value={exception.id}
              />
              <div>
                <p className="font-medium">{exception.resourcePool.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatJalaliDate(exception.date)} - default{" "}
                  {exception.resourcePool.capacity}
                </p>
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor={`capacity-exception-value-${exception.id}`}>
                  Capacity
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
                <FieldLabel htmlFor={`capacity-exception-reason-${exception.id}`}>
                  Reason
                </FieldLabel>
                <TextInput
                  defaultValue={exception.reason ?? ""}
                  id={`capacity-exception-reason-${exception.id}`}
                  maxLength={200}
                  name="reason"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit">
                  <Save className="h-4 w-4" />
                  Save
                </Button>
              </div>
              <div className="flex items-end">
                <Button
                  formAction={deleteCapacityExceptionAction}
                  type="submit"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
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
  return (
    <section className="rounded-lg border bg-card p-5 text-card-foreground">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">Weekly schedule</h2>
        <p className="text-sm text-muted-foreground">
          Day numbers use JavaScript Date.getDay(): Sunday 0 through Saturday 6.
        </p>
      </div>

      <div className="mt-5 grid gap-3">
        {schedules.map((schedule) => (
          <form
            action={updateWeeklyScheduleAction}
            className="grid gap-4 rounded-md border bg-muted/20 p-4 lg:grid-cols-[160px_120px_120px_1fr_auto]"
            key={schedule.id}
          >
            <input name="scheduleId" type="hidden" value={schedule.id} />
            <div>
              <p className="font-medium">
                {DAY_LABELS[schedule.dayOfWeek] ?? `Day ${schedule.dayOfWeek}`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                dayOfWeek {schedule.dayOfWeek}
              </p>
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor={`weekly-start-${schedule.id}`}>
                Start
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
              <FieldLabel htmlFor={`weekly-end-${schedule.id}`}>End</FieldLabel>
              <TextInput
                defaultValue={schedule.endTime}
                id={`weekly-end-${schedule.id}`}
                name="endTime"
                pattern="([01]\d|2[0-3]):00"
                placeholder="17:00"
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                className="h-4 w-4 rounded border-input"
                defaultChecked={schedule.isWorkingDay}
                name="isWorkingDay"
                type="checkbox"
              />
              Working day
            </label>
            <div className="flex items-end">
              <Button type="submit">
                <Save className="h-4 w-4" />
                Save
              </Button>
            </div>
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
  return (
    <section className="rounded-lg border bg-card p-5 text-card-foreground">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">Schedule exceptions</h2>
        <p className="text-sm text-muted-foreground">
          Exceptions override the weekly schedule for one Jalali date.
        </p>
      </div>

      <form
        action={importIranHolidaysAction}
        className="mt-5 grid gap-3 rounded-md border bg-muted/20 p-4 sm:grid-cols-[160px_auto] sm:items-end"
      >
        <div className="grid gap-2">
          <FieldLabel htmlFor="iran-holiday-year">Jalali year</FieldLabel>
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
        <div className="flex items-end">
          <Button type="submit">Import Iran holidays</Button>
        </div>
      </form>

      <form
        action={createScheduleExceptionAction}
        className="mt-5 grid gap-4 rounded-md border bg-muted/20 p-4 lg:grid-cols-[150px_120px_120px_1fr_auto_auto]"
      >
        <div className="grid gap-2">
          <FieldLabel htmlFor="exception-date">Jalali date</FieldLabel>
          <TextInput
            id="exception-date"
            name="date"
            placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
            required
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="exception-start">Start</FieldLabel>
          <TextInput
            id="exception-start"
            name="startTime"
            pattern="([01]\d|2[0-3]):00"
            placeholder="09:00"
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="exception-end">End</FieldLabel>
          <TextInput
            id="exception-end"
            name="endTime"
            pattern="([01]\d|2[0-3]):00"
            placeholder="17:00"
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="exception-reason">Reason</FieldLabel>
          <TextInput
            id="exception-reason"
            maxLength={200}
            name="reason"
            placeholder="Holiday or special hours"
          />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            className="h-4 w-4 rounded border-input"
            defaultChecked
            name="isWorkingDay"
            type="checkbox"
          />
          Working
        </label>
        <div className="flex items-end">
          <Button type="submit">Create</Button>
        </div>
      </form>

      {exceptions.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          No date-specific exceptions are configured.
        </p>
      ) : (
        <div className="mt-5 grid gap-3">
          {exceptions.map((exception) => (
            <form
              action={updateScheduleExceptionAction}
              className="grid gap-4 rounded-md border bg-muted/20 p-4 lg:grid-cols-[180px_120px_120px_1fr_auto_auto_auto]"
              key={exception.id}
            >
              <input name="exceptionId" type="hidden" value={exception.id} />
              <div>
                <p className="font-medium">{formatJalaliDate(exception.date)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {exception.isWorkingDay ? "Working" : "Disabled"}
                </p>
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor={`exception-start-${exception.id}`}>
                  Start
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
                  End
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
                  Reason
                </FieldLabel>
                <TextInput
                  defaultValue={exception.reason ?? ""}
                  id={`exception-reason-${exception.id}`}
                  maxLength={200}
                  name="reason"
                />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  className="h-4 w-4 rounded border-input"
                  defaultChecked={exception.isWorkingDay}
                  name="isWorkingDay"
                  type="checkbox"
                />
                Working
              </label>
              <div className="flex items-end">
                <Button type="submit">
                  <Save className="h-4 w-4" />
                  Save
                </Button>
              </div>
              <div className="flex items-end">
                <Button
                  formAction={deleteScheduleExceptionAction}
                  type="submit"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </form>
          ))}
        </div>
      )}
    </section>
  );
}
