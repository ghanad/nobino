import Link from "next/link";
import {
  CalendarDays,
  Database,
  KeyRound,
  Save,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { UserRole } from "@prisma/client";
import type { ReactNode } from "react";

import {
  createCapacityExceptionAction,
  createUserAction,
  createScheduleExceptionAction,
  deleteCapacityExceptionAction,
  deleteScheduleExceptionAction,
  importIranHolidaysAction,
  updateCapacityExceptionAction,
  resetUserPasswordAction,
  updateResourcePoolAction,
  updateScheduleExceptionAction,
  updateUserAction,
  updateWeeklyScheduleAction,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  JALALI_DATE_INPUT_PLACEHOLDER,
  formatJalaliDate,
  formatJalaliDateParam,
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
    scheduleUpdated?: string;
    userCreated?: string;
    userUpdated?: string;
  }>;
};

const ADMIN_TABS = ["users", "capacity", "schedule"] as const;

type AdminTab = (typeof ADMIN_TABS)[number];

const ADMIN_TAB_LABELS: Record<AdminTab, string> = {
  users: "Users",
  capacity: "Capacity",
  schedule: "Schedule",
};

const ADMIN_TAB_ICONS: Record<AdminTab, typeof Users> = {
  users: Users,
  capacity: Database,
  schedule: CalendarDays,
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

function getActiveAdminTab(
  params: Awaited<AdminPageProps["searchParams"]>,
): AdminTab {
  if (params?.tab && ADMIN_TABS.includes(params.tab as AdminTab)) {
    return params.tab as AdminTab;
  }

  if (params?.poolUpdated || params?.capacityExceptionCreated) {
    return "capacity";
  }

  if (
    params?.capacityExceptionUpdated ||
    params?.capacityExceptionDeleted ||
    params?.scheduleUpdated ||
    params?.exceptionCreated ||
    params?.exceptionUpdated ||
    params?.exceptionDeleted ||
    params?.holidayImported
  ) {
    return params?.scheduleUpdated ||
      params?.exceptionCreated ||
      params?.exceptionUpdated ||
      params?.exceptionDeleted ||
      params?.holidayImported
      ? "schedule"
      : "capacity";
  }

  return "users";
}

function getAdminToast(params: Awaited<AdminPageProps["searchParams"]>) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  const successMessage =
    (params?.poolUpdated && "Resource pool settings updated.") ||
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

function AdminTabs({ activeTab }: { activeTab: AdminTab }) {
  return (
    <nav
      aria-label="Admin sections"
      className="grid gap-2 rounded-lg border bg-card p-2 text-card-foreground sm:grid-cols-3"
    >
      {ADMIN_TABS.map((tab) => {
        const Icon = ADMIN_TAB_ICONS[tab];
        const isActive = tab === activeTab;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
                : "inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            }
            href={`/admin?tab=${tab}`}
            key={tab}
          >
            <Icon className="h-4 w-4" />
            {ADMIN_TAB_LABELS[tab]}
          </Link>
        );
      })}
    </nav>
  );
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

function UserManagement({
  currentAdminId,
  users,
}: {
  currentAdminId: string;
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: UserRole;
    active: boolean;
    createdAt: Date;
  }>;
}) {
  return (
    <section className="rounded-lg border bg-card p-5 text-card-foreground">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">Users</h2>
        <p className="text-sm text-muted-foreground">
          Create accounts, change roles, deactivate users, and set temporary
          passwords.
        </p>
      </div>

      <form
        action={createUserAction}
        className="mt-5 grid gap-4 rounded-md border bg-muted/20 p-4 lg:grid-cols-[1fr_1.2fr_150px_180px_auto]"
      >
        <div className="grid gap-2">
          <FieldLabel htmlFor="new-user-name">Name</FieldLabel>
          <TextInput id="new-user-name" maxLength={100} name="name" required />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="new-user-email">Email</FieldLabel>
          <TextInput
            id="new-user-email"
            maxLength={200}
            name="email"
            required
            type="email"
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="new-user-role">Role</FieldLabel>
          <SelectInput defaultValue={UserRole.USER} id="new-user-role" name="role">
            <option value={UserRole.USER}>User</option>
            <option value={UserRole.MANAGER}>Manager</option>
            <option value={UserRole.ADMIN}>Admin</option>
          </SelectInput>
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="new-user-password">
            Temporary password
          </FieldLabel>
          <TextInput
            id="new-user-password"
            minLength={8}
            name="password"
            required
            type="password"
          />
        </div>
        <div className="flex items-end">
          <Button type="submit">
            <UserPlus className="h-4 w-4" />
            Create
          </Button>
        </div>
      </form>

      <div className="mt-5 grid gap-3">
        {users.map((user) => (
          <div className="rounded-md border bg-muted/20 p-4" key={user.id}>
            <form
              action={updateUserAction}
              className="grid gap-4 lg:grid-cols-[1fr_1.2fr_150px_1fr_auto]"
            >
              <input name="userId" type="hidden" value={user.id} />
              <div className="grid gap-2">
                <FieldLabel htmlFor={`user-name-${user.id}`}>Name</FieldLabel>
                <TextInput
                  defaultValue={user.name}
                  id={`user-name-${user.id}`}
                  maxLength={100}
                  name="name"
                  required
                />
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor={`user-email-${user.id}`}>Email</FieldLabel>
                <TextInput
                  defaultValue={user.email}
                  disabled
                  id={`user-email-${user.id}`}
                />
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor={`user-role-${user.id}`}>Role</FieldLabel>
                <SelectInput
                  defaultValue={user.role}
                  id={`user-role-${user.id}`}
                  name="role"
                >
                  <option value={UserRole.USER}>User</option>
                  <option value={UserRole.MANAGER}>Manager</option>
                  <option value={UserRole.ADMIN}>Admin</option>
                </SelectInput>
              </div>
              <div className="flex flex-col justify-end gap-2">
                {user.id === currentAdminId ? (
                  <input name="active" type="hidden" value="on" />
                ) : null}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    className="h-4 w-4 rounded border-input"
                    defaultChecked={user.active}
                    disabled={user.id === currentAdminId}
                    name="active"
                    type="checkbox"
                  />
                  Active
                </label>
                {user.id === currentAdminId ? (
                  <p className="text-xs text-muted-foreground">
                    Your own account cannot be deactivated here.
                  </p>
                ) : null}
              </div>
              <div className="flex items-end">
                <Button type="submit">
                  <Save className="h-4 w-4" />
                  Save
                </Button>
              </div>
            </form>

            <form
              action={resetUserPasswordAction}
              className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-[1fr_auto]"
            >
              <input name="userId" type="hidden" value={user.id} />
              <div className="grid gap-2">
                <FieldLabel htmlFor={`user-password-${user.id}`}>
                  Temporary password
                </FieldLabel>
                <TextInput
                  id={`user-password-${user.id}`}
                  minLength={8}
                  name="password"
                  placeholder="At least 8 characters"
                  required
                  type="password"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" variant="outline">
                  <KeyRound className="h-4 w-4" />
                  Set password
                </Button>
              </div>
            </form>
          </div>
        ))}
      </div>
    </section>
  );
}

function ResourcePoolSettings({
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

function CapacityExceptions({
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

function WeeklyScheduleSettings({
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

function ScheduleExceptions({
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

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const currentAdmin = await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const toast = getAdminToast(params);
  const activeTab = getActiveAdminTab(params);
  const currentJalaliYear = formatJalaliDateParam(new Date()).split("-")[0];
  const [resourcePools, capacityExceptions, schedules, exceptions, users] =
    await Promise.all([
    db.resourcePool.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        capacity: true,
        active: true,
      },
    }),
    db.resourcePoolCapacityException.findMany({
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        date: true,
        capacity: true,
        reason: true,
        resourcePool: {
          select: {
            id: true,
            name: true,
            capacity: true,
          },
        },
      },
    }),
    db.workingSchedule.findMany({
      orderBy: { dayOfWeek: "asc" },
      select: {
        id: true,
        dayOfWeek: true,
        isWorkingDay: true,
        startTime: true,
        endTime: true,
      },
    }),
    db.scheduleException.findMany({
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        isWorkingDay: true,
        startTime: true,
        endTime: true,
        reason: true,
      },
    }),
    db.user.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <div className="grid gap-6">
      {toast ? <UrlToast {...toast} /> : null}
      <AdminTabs activeTab={activeTab} />
      {activeTab === "users" ? (
        <UserManagement currentAdminId={currentAdmin.id} users={users} />
      ) : null}
      {activeTab === "capacity" ? (
        <>
          <ResourcePoolSettings resourcePools={resourcePools} />
          <CapacityExceptions
            capacityExceptions={capacityExceptions}
            resourcePools={resourcePools}
          />
        </>
      ) : null}
      {activeTab === "schedule" ? (
        <>
          <WeeklyScheduleSettings schedules={schedules} />
          <ScheduleExceptions
            currentJalaliYear={currentJalaliYear}
            exceptions={exceptions}
          />
        </>
      ) : null}
    </div>
  );
}
