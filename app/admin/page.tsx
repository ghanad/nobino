import { Save, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import {
  createScheduleExceptionAction,
  deleteScheduleExceptionAction,
  updateResourcePoolAction,
  updateScheduleExceptionAction,
  updateWeeklyScheduleAction,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import {
  JALALI_DATE_INPUT_PLACEHOLDER,
  formatJalaliDate,
} from "@/lib/jalali-date";

type AdminPageProps = {
  searchParams?: Promise<{
    error?: string;
    exceptionCreated?: string;
    exceptionDeleted?: string;
    exceptionUpdated?: string;
    poolUpdated?: string;
    scheduleUpdated?: string;
  }>;
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

function AdminFlash({
  params,
}: {
  params: Awaited<AdminPageProps["searchParams"]>;
}) {
  if (params?.error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {params.error}
      </div>
    );
  }

  const successMessage =
    (params?.poolUpdated && "Resource pool settings updated.") ||
    (params?.scheduleUpdated && "Weekly schedule updated.") ||
    (params?.exceptionCreated && "Schedule exception created.") ||
    (params?.exceptionUpdated && "Schedule exception updated.") ||
    (params?.exceptionDeleted && "Schedule exception deleted.");

  if (!successMessage) {
    return null;
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      {successMessage}
    </div>
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
  exceptions,
}: {
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
  const params = await searchParams;
  const [resourcePools, schedules, exceptions] = await Promise.all([
    db.resourcePool.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        capacity: true,
        active: true,
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
  ]);

  return (
    <div className="grid gap-6">
      <AdminFlash params={params} />
      <ResourcePoolSettings resourcePools={resourcePools} />
      <WeeklyScheduleSettings schedules={schedules} />
      <ScheduleExceptions exceptions={exceptions} />
    </div>
  );
}
