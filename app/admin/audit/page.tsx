import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarClock, Filter, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  JALALI_DATE_INPUT_PLACEHOLDER,
  formatJalaliDateTime,
  parseJalaliDateParam,
} from "@/lib/jalali-date";

type AuditPageProps = {
  searchParams?: Promise<{
    action?: string;
    actorId?: string;
    entityType?: string;
    from?: string;
    to?: string;
  }>;
};

type AuditLogRow = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  oldValue: Prisma.JsonValue | null;
  newValue: Prisma.JsonValue | null;
  createdAt: Date;
  actor: {
    id: string;
    name: string;
    email: string;
  } | null;
};

type AuditJsonRecord = Record<string, Prisma.JsonValue>;

const ACTION_LABELS: Record<string, string> = {
  ALTERNATIVE_ACCEPTED: "Alternative accepted",
  ALTERNATIVE_PROPOSED: "Alternative proposed",
  ALTERNATIVE_REJECTED: "Alternative rejected",
  CAPACITY_CHANGED: "Capacity changed",
  CAPACITY_EXCEPTION_CREATED: "Capacity exception added",
  CAPACITY_EXCEPTION_DELETED: "Capacity exception removed",
  CAPACITY_EXCEPTION_UPDATED: "Capacity exception updated",
  RESERVATION_APPROVED: "Reservation approved",
  RESERVATION_CANCELLED: "Reservation cancelled",
  RESERVATION_CREATED: "Reservation requested",
  RESERVATION_REJECTED: "Reservation rejected",
  SCHEDULE_EXCEPTION_CREATED: "Schedule exception added",
  SCHEDULE_EXCEPTION_DELETED: "Schedule exception removed",
  SCHEDULE_EXCEPTION_UPDATED: "Schedule exception updated",
  USER_CREATED: "User created",
  USER_PASSWORD_RESET: "Password reset",
  USER_ROLE_CHANGED: "User role changed",
  USER_UPDATED: "User updated",
  WORKING_SCHEDULE_CHANGED: "Weekly schedule changed",
};

const ENTITY_LABELS: Record<string, string> = {
  Reservation: "Reservation",
  ResourcePool: "Capacity",
  ResourcePoolCapacityException: "Daily capacity",
  ScheduleException: "Schedule exception",
  User: "User",
  WorkingSchedule: "Weekly schedule",
};

const FIELD_LABELS: Record<string, string> = {
  active: "Active",
  capacity: "Capacity",
  date: "Date",
  email: "Email",
  endAt: "End",
  endTime: "End time",
  isWorkingDay: "Working day",
  name: "Name",
  proposedEndAt: "Proposed end",
  proposedStartAt: "Proposed start",
  reason: "Reason",
  rejectionReason: "Rejection reason",
  role: "Role",
  startAt: "Start",
  startTime: "Start time",
  status: "Status",
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

const NOISE_FIELDS = new Set([
  "alternativeId",
  "approvedAt",
  "approvedById",
  "cancelledAt",
  "cancelledById",
  "createdAt",
  "createdById",
  "id",
  "passwordReset",
  "resourcePoolId",
  "updatedAt",
  "userId",
]);

const DATE_RANGE_FIELDS = new Set([
  "endAt",
  "proposedEndAt",
  "proposedStartAt",
  "startAt",
]);

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

function addDays(date: Date, days: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    0,
    0,
    0,
    0,
  );
}

function buildAuditWhere(
  params: Awaited<AuditPageProps["searchParams"]>,
): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (params?.actorId) {
    where.actorUserId = params.actorId;
  }

  if (params?.entityType) {
    where.entityType = params.entityType;
  }

  if (params?.action) {
    where.action = params.action;
  }

  const fromDate = parseJalaliDateParam(params?.from);
  const toDate = parseJalaliDateParam(params?.to);

  if (fromDate || toDate) {
    where.createdAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lt: addDays(toDate, 1) } : {}),
    };
  }

  return where;
}

function isRecord(value: Prisma.JsonValue | null): value is AuditJsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getRecord(value: Prisma.JsonValue | null): AuditJsonRecord {
  return isRecord(value) ? value : {};
}

function getString(record: AuditJsonRecord, key: string): string | null {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function getNumber(record: AuditJsonRecord, key: string): number | null {
  const value = record[key];

  return typeof value === "number" ? value : null;
}

function formatIsoDateTime(value: string): string | null {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatJalaliDateTime(date);
}

function formatIsoDateOnly(value: string): string | null {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatJalaliDateTime(date).split("،")[0] ?? null;
}

function formatDateRange(record: AuditJsonRecord): string | null {
  const startAt = getString(record, "startAt") ?? getString(record, "proposedStartAt");
  const endAt = getString(record, "endAt") ?? getString(record, "proposedEndAt");

  if (!startAt || !endAt) {
    return null;
  }

  const start = new Date(startAt);
  const end = new Date(endAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const endTime = formatJalaliDateTime(end).split("، ")[1] ?? "";

  return `${formatJalaliDateTime(start)} تا ${endTime}`;
}

function formatAuditValue(key: string, value: Prisma.JsonValue): string {
  if (value === null) {
    return "Empty";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return key === "dayOfWeek" ? DAY_LABELS[value] ?? String(value) : String(value);
  }

  if (typeof value === "string") {
    if (key === "date") {
      return formatIsoDateOnly(value) ?? value;
    }

    if (key.endsWith("At") || key.startsWith("proposed")) {
      return formatIsoDateTime(value) ?? value;
    }

    return value;
  }

  return JSON.stringify(value);
}

function formatChangeRows(log: AuditLogRow): Array<{ label: string; value: string }> {
  const oldRecord = getRecord(log.oldValue);
  const newRecord = getRecord(log.newValue);
  const source = Object.keys(newRecord).length > 0 ? newRecord : oldRecord;
  const hasDateRange = formatDateRange(source) !== null;
  const rows: Array<{ label: string; value: string }> = [];

  if (source.dayOfWeek !== undefined) {
    rows.push({
      label: "Day",
      value: formatAuditValue("dayOfWeek", source.dayOfWeek),
    });
  }

  for (const [key, value] of Object.entries(source)) {
    if (
      NOISE_FIELDS.has(key) ||
      key === "dayOfWeek" ||
      (hasDateRange && DATE_RANGE_FIELDS.has(key))
    ) {
      continue;
    }

    const oldValue = oldRecord[key];
    const changed = oldValue !== undefined && JSON.stringify(oldValue) !== JSON.stringify(value);

    rows.push({
      label: FIELD_LABELS[key] ?? key,
      value: changed
        ? `${formatAuditValue(key, oldValue)} -> ${formatAuditValue(key, value)}`
        : formatAuditValue(key, value),
    });
  }

  return rows.slice(0, 3);
}

function buildAuditDescription(log: AuditLogRow): string {
  const newRecord = getRecord(log.newValue);
  const oldRecord = getRecord(log.oldValue);
  const dateRange = formatDateRange(newRecord) ?? formatDateRange(oldRecord);

  if (dateRange) {
    return dateRange;
  }

  const capacity = getNumber(newRecord, "capacity");
  const oldCapacity = getNumber(oldRecord, "capacity");

  if (capacity !== null && oldCapacity !== null && capacity !== oldCapacity) {
    return `Capacity ${oldCapacity} -> ${capacity}`;
  }

  if (capacity !== null) {
    return `Capacity ${capacity}`;
  }

  const email = getString(newRecord, "email") ?? getString(oldRecord, "email");
  const name = getString(newRecord, "name") ?? getString(oldRecord, "name");

  if (name && email) {
    return `${name} (${email})`;
  }

  return "No extra summary available";
}

function stringifyAuditValue(value: Prisma.JsonValue | null): string {
  if (value === null) {
    return "None";
  }

  return JSON.stringify(value, null, 2);
}

function shortId(value: string): string {
  return value.length > 10 ? `${value.slice(0, 8)}...` : value;
}

function AuditFilters({
  actions,
  actors,
  entityTypes,
  params,
}: {
  actions: string[];
  actors: Array<{ id: string; name: string; email: string }>;
  entityTypes: string[];
  params: Awaited<AuditPageProps["searchParams"]>;
}) {
  return (
    <section className="rounded-lg border bg-card p-5 text-card-foreground">
      <form className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-2">
          <FieldLabel htmlFor="audit-actor">Actor</FieldLabel>
          <SelectInput
            defaultValue={params?.actorId ?? ""}
            id="audit-actor"
            name="actorId"
          >
            <option value="">All actors</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name} ({actor.email})
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="grid gap-2">
          <FieldLabel htmlFor="audit-entity-type">Entity</FieldLabel>
          <SelectInput
            defaultValue={params?.entityType ?? ""}
            id="audit-entity-type"
            name="entityType"
          >
            <option value="">All entities</option>
            {entityTypes.map((entityType) => (
              <option key={entityType} value={entityType}>
                {entityType}
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="grid gap-2">
          <FieldLabel htmlFor="audit-action">Action</FieldLabel>
          <SelectInput
            defaultValue={params?.action ?? ""}
            id="audit-action"
            name="action"
          >
            <option value="">All actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="grid gap-2">
          <FieldLabel htmlFor="audit-from">From</FieldLabel>
          <TextInput
            defaultValue={params?.from ?? ""}
            id="audit-from"
            name="from"
            placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel htmlFor="audit-to">To</FieldLabel>
          <TextInput
            defaultValue={params?.to ?? ""}
            id="audit-to"
            name="to"
            placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
          />
        </div>

        <div className="flex items-end gap-2">
          <Button type="submit">
            <Filter className="h-4 w-4" />
            Filter
          </Button>
          <Button asChild type="button" variant="outline">
            <Link href="/admin/audit">
              <RotateCcw className="h-4 w-4" />
              Reset
            </Link>
          </Button>
        </div>
      </form>
    </section>
  );
}

function AuditLogCard({ log }: { log: AuditLogRow }) {
  const rows = formatChangeRows(log);
  const hasRawValues = log.oldValue !== null || log.newValue !== null;

  return (
    <article className="rounded-lg border bg-card p-4 text-card-foreground">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-secondary px-2 py-1 font-medium text-secondary-foreground">
              {ENTITY_LABELS[log.entityType] ?? log.entityType}
            </span>
            <span className="text-muted-foreground">
              {formatJalaliDateTime(log.createdAt)}
            </span>
          </div>
          <h2 className="mt-2 text-base font-semibold">
            {ACTION_LABELS[log.action] ?? log.action}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {buildAuditDescription(log)}
          </p>
        </div>
        <div className="rounded-md bg-muted/40 px-3 py-2 text-sm lg:text-right">
          <p className="text-xs text-muted-foreground">Actor</p>
          <p className="mt-1 font-medium">{log.actor?.name ?? "System"}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {log.actor?.email ?? "No actor recorded"}
          </p>
        </div>
      </div>

      {rows.length > 0 ? (
        <dl className="mt-4 grid gap-2 border-t pt-3 text-sm md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="mt-0.5 break-words font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <details className="mt-3 border-t pt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">
          Technical details
        </summary>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <dt>Record ID</dt>
            <dd className="mt-1 break-all font-mono text-foreground">
              {shortId(log.entityId)}
            </dd>
          </div>
          <div>
            <dt>Event ID</dt>
            <dd className="mt-1 break-all font-mono text-foreground">
              {shortId(log.id)}
            </dd>
          </div>
        </dl>
        {hasRawValues ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <pre className="max-h-48 overflow-auto rounded-md border bg-muted/30 p-3 text-[11px] leading-relaxed text-foreground">
              {stringifyAuditValue(log.oldValue)}
            </pre>
            <pre className="max-h-48 overflow-auto rounded-md border bg-muted/30 p-3 text-[11px] leading-relaxed text-foreground">
              {stringifyAuditValue(log.newValue)}
            </pre>
          </div>
        ) : null}
      </details>
    </article>
  );
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  await requireRole([UserRole.ADMIN]);

  const params = await searchParams;
  const where = buildAuditWhere(params);

  const [logs, filterSource, actors] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        action: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
    db.auditLog.findMany({
      orderBy: [{ entityType: "asc" }, { action: "asc" }],
      select: {
        entityType: true,
        action: true,
      },
    }),
    db.user.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
      },
    }),
  ]);

  const entityTypes = uniqueSorted(filterSource.map((log) => log.entityType));
  const actions = uniqueSorted(filterSource.map((log) => log.action));

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-normal">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compact history of reservations, capacity, schedule, and user
            changes.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin">Back to admin</Link>
        </Button>
      </div>

      <AuditFilters
        actions={actions}
        actors={actors}
        entityTypes={entityTypes}
        params={params}
      />

      <section className="grid gap-4">
        <div className="flex items-center justify-between">
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            Latest {logs.length} matching events
          </p>
        </div>

        {logs.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            No audit events match these filters.
          </div>
        ) : (
          logs.map((log) => <AuditLogCard key={log.id} log={log} />)
        )}
      </section>
    </div>
  );
}
