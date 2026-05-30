import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Filter,
  RotateCcw,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
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
    page?: string;
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
  ALTERNATIVE_ACCEPTED: "پیشنهاد جایگزین پذیرفته شد",
  ALTERNATIVE_PROPOSED: "زمان جایگزین پیشنهاد شد",
  ALTERNATIVE_REJECTED: "پیشنهاد جایگزین رد شد",
  CAPACITY_CHANGED: "ظرفیت تغییر کرد",
  CAPACITY_EXCEPTION_CREATED: "استثنای ظرفیت اضافه شد",
  CAPACITY_EXCEPTION_DELETED: "استثنای ظرفیت حذف شد",
  CAPACITY_EXCEPTION_UPDATED: "استثنای ظرفیت ویرایش شد",
  RESERVATION_APPROVED: "رزرو تایید شد",
  RESERVATION_CANCELLED: "رزرو لغو شد",
  RESERVATION_CREATED: "درخواست رزرو ثبت شد",
  RESERVATION_POLICY_CHANGED: "سیاست رزرو تغییر کرد",
  RESERVATION_REJECTED: "رزرو رد شد",
  RESERVATION_TIME_UPDATED: "زمان رزرو تغییر کرد",
  SCHEDULE_EXCEPTION_CREATED: "استثنای برنامه کاری اضافه شد",
  SCHEDULE_EXCEPTION_DELETED: "استثنای برنامه کاری حذف شد",
  SCHEDULE_EXCEPTION_UPDATED: "استثنای برنامه کاری ویرایش شد",
  USER_CREATED: "کاربر ساخته شد",
  USER_DELETED: "کاربر حذف شد",
  USER_PASSWORD_RESET: "رمز عبور بازنشانی شد",
  USER_ROLE_CHANGED: "نقش کاربر تغییر کرد",
  USER_UPDATED: "کاربر ویرایش شد",
  WORKING_SCHEDULE_CHANGED: "برنامه هفتگی تغییر کرد",
};

const ENTITY_LABELS: Record<string, string> = {
  Reservation: "رزرو",
  ReservationPolicy: "سیاست رزرو",
  ResourcePool: "ظرفیت",
  ResourcePoolCapacityException: "ظرفیت روزانه",
  ScheduleException: "استثنای برنامه کاری",
  User: "کاربر",
  WorkingSchedule: "برنامه هفتگی",
};

const FIELD_LABELS: Record<string, string> = {
  active: "وضعیت کاربر",
  capacity: "ظرفیت",
  dailyUserHourLimit: "سقف روزانه هر کاربر",
  date: "تاریخ",
  email: "ایمیل",
  endAt: "پایان",
  endTime: "پایان کار",
  isWorkingDay: "روز کاری",
  name: "نام",
  oneReservationPerDayEnabled: "محدودیت یک رزرو در روز",
  partySize: "تعداد نفرات",
  proposedEndAt: "پایان پیشنهادی",
  proposedStartAt: "شروع پیشنهادی",
  reason: "دلیل",
  rejectionReason: "دلیل رد",
  role: "نقش",
  startAt: "شروع",
  startTime: "شروع کار",
  status: "وضعیت",
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

const STATUS_LABELS: Record<string, string> = {
  ALTERNATIVE_PROPOSED: "زمان جایگزین پیشنهاد شده",
  APPROVED: "تایید شده",
  CANCELLED: "لغو شده",
  PENDING: "در انتظار تایید",
  REJECTED: "رد شده",
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "ادمین",
  MANAGER: "مدیر",
  USER: "کاربر",
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
const AUDIT_PAGE_SIZE = 25;
const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR");

function formatPersianNumber(value: number): string {
  return PERSIAN_NUMBER_FORMATTER.format(value);
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
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-right text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-right text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
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
    return "خالی";
  }

  if (typeof value === "boolean") {
    return value ? "بله" : "خیر";
  }

  if (typeof value === "number") {
    return key === "dayOfWeek"
      ? DAY_LABELS[value] ?? formatPersianNumber(value)
      : formatPersianNumber(value);
  }

  if (typeof value === "string") {
    if (key === "date") {
      return formatIsoDateOnly(value) ?? value;
    }

    if (key.endsWith("At") || key.startsWith("proposed")) {
      return formatIsoDateTime(value) ?? value;
    }

    if (key === "role") {
      return ROLE_LABELS[value] ?? value;
    }

    if (key === "status") {
      return STATUS_LABELS[value] ?? value;
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
      label: "روز",
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
        ? `از ${formatAuditValue(key, oldValue)} به ${formatAuditValue(key, value)}`
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
    return `ظرفیت از ${formatPersianNumber(oldCapacity)} به ${formatPersianNumber(
      capacity,
    )} تغییر کرد`;
  }

  if (capacity !== null) {
    return `ظرفیت ${formatPersianNumber(capacity)}`;
  }

  const email = getString(newRecord, "email") ?? getString(oldRecord, "email");
  const name = getString(newRecord, "name") ?? getString(oldRecord, "name");

  if (name && email) {
    return `${name} (${email})`;
  }

  return "خلاصه بیشتری ثبت نشده است";
}

function stringifyAuditValue(value: Prisma.JsonValue | null): string {
  if (value === null) {
    return "خالی";
  }

  return JSON.stringify(value, null, 2);
}

function shortId(value: string): string {
  return value.length > 10 ? `${value.slice(0, 8)}…` : value;
}

function getAuditPage(value: string | undefined): number {
  const parsedPage = Number(value);

  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    return 1;
  }

  return parsedPage;
}

function getAuditPageHref(
  params: Awaited<AuditPageProps["searchParams"]>,
  page: number,
): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value && key !== "page") {
      searchParams.set(key, value);
    }
  }

  if (page > 1) {
    searchParams.set("page", String(page));
  }

  const query = searchParams.toString();

  return query ? `/admin/audit?${query}` : "/admin/audit";
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
    <section
      className="rounded-lg border bg-card p-5 text-card-foreground"
      dir="rtl"
    >
      <div className="mb-4 flex flex-col gap-1 text-right sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">فیلتر گزارش</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            برای بررسی تغییرات یک کاربر، بخش یا بازه زمانی مشخص، فیلترها را
            محدود کنید.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          تاریخ‌ها را با تقویم جلالی وارد کنید.
        </span>
      </div>
      <form className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-2">
          <FieldLabel htmlFor="audit-actor">انجام‌دهنده</FieldLabel>
          <SelectInput
            defaultValue={params?.actorId ?? ""}
            id="audit-actor"
            name="actorId"
          >
            <option value="">همه کاربران</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name} ({actor.email})
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="grid gap-2">
          <FieldLabel htmlFor="audit-entity-type">بخش</FieldLabel>
          <SelectInput
            defaultValue={params?.entityType ?? ""}
            id="audit-entity-type"
            name="entityType"
          >
            <option value="">همه بخش‌ها</option>
            {entityTypes.map((entityType) => (
              <option key={entityType} value={entityType}>
                {ENTITY_LABELS[entityType] ?? entityType}
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="grid gap-2">
          <FieldLabel htmlFor="audit-action">نوع تغییر</FieldLabel>
          <SelectInput
            defaultValue={params?.action ?? ""}
            id="audit-action"
            name="action"
          >
            <option value="">همه تغییرات</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {ACTION_LABELS[action] ?? action}
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="grid gap-2">
          <FieldLabel htmlFor="audit-from">از تاریخ</FieldLabel>
          <TextInput
            defaultValue={params?.from ?? ""}
            id="audit-from"
            name="from"
            placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel htmlFor="audit-to">تا تاریخ</FieldLabel>
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
            اعمال فیلتر
          </Button>
          <Button asChild type="button" variant="outline">
            <Link href="/admin/audit">
              <RotateCcw className="h-4 w-4" />
              پاک کردن
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
    <article
      className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm"
      dir="rtl"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-700">
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
        <div className="rounded-md bg-muted/40 px-3 py-2 text-sm text-right">
          <p className="text-xs text-muted-foreground">انجام‌دهنده</p>
          <p className="mt-1 font-medium">{log.actor?.name ?? "سیستم"}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {log.actor?.email ?? "کاربری ثبت نشده است"}
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
          جزئیات فنی
        </summary>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <dt>شناسه رکورد</dt>
            <dd className="mt-1 break-all font-mono text-foreground">
              {shortId(log.entityId)}
            </dd>
          </div>
          <div>
            <dt>شناسه رویداد</dt>
            <dd className="mt-1 break-all font-mono text-foreground">
              {shortId(log.id)}
            </dd>
          </div>
        </dl>
        {hasRawValues ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <pre className="max-h-48 overflow-auto rounded-md border bg-muted/30 p-3 text-[11px] leading-relaxed text-foreground">
              {`مقدار قبلی\n`}
              {stringifyAuditValue(log.oldValue)}
            </pre>
            <pre className="max-h-48 overflow-auto rounded-md border bg-muted/30 p-3 text-[11px] leading-relaxed text-foreground">
              {`مقدار جدید\n`}
              {stringifyAuditValue(log.newValue)}
            </pre>
          </div>
        ) : null}
      </details>
    </article>
  );
}

function AuditPagination({
  currentPage,
  params,
  totalPages,
}: {
  currentPage: number;
  params: Awaited<AuditPageProps["searchParams"]>;
  totalPages: number;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" dir="rtl">
      {currentPage > 1 ? (
        <Button asChild size="sm" variant="outline">
          <Link href={getAuditPageHref(params, currentPage - 1)}>
            <ChevronRight className="h-4 w-4" />
            صفحه قبلی
          </Link>
        </Button>
      ) : (
        <Button disabled size="sm" variant="outline">
          <ChevronRight className="h-4 w-4" />
          صفحه قبلی
        </Button>
      )}
      <span className="text-muted-foreground">
        صفحه {formatPersianNumber(currentPage)} از{" "}
        {formatPersianNumber(totalPages)}
      </span>
      {currentPage < totalPages ? (
        <Button asChild size="sm" variant="outline">
          <Link href={getAuditPageHref(params, currentPage + 1)}>
            صفحه بعدی
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
      ) : (
        <Button disabled size="sm" variant="outline">
          صفحه بعدی
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  await requireRole([UserRole.ADMIN]);

  const params = await searchParams;
  const where = buildAuditWhere(params);

  const [totalLogs, filterSource, actors] = await Promise.all([
    db.auditLog.count({ where }),
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
  const totalPages = Math.max(1, Math.ceil(totalLogs / AUDIT_PAGE_SIZE));
  const currentPage = Math.min(getAuditPage(params?.page), totalPages);
  const firstEventNumber =
    totalLogs === 0 ? 0 : (currentPage - 1) * AUDIT_PAGE_SIZE + 1;
  const lastEventNumber = Math.min(currentPage * AUDIT_PAGE_SIZE, totalLogs);
  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE,
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
  });

  const entityTypes = uniqueSorted(filterSource.map((log) => log.entityType));
  const actions = uniqueSorted(filterSource.map((log) => log.action));

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link href="/admin">بازگشت به مدیریت</Link>
          </Button>
        }
        subtitle="تاریخچه تغییرات رزروها، ظرفیت، برنامه کاری و کاربران"
        title="گزارش فعالیت‌ها"
      />

      <AuditFilters
        actions={actions}
        actors={actors}
        entityTypes={entityTypes}
        params={params}
      />

      <section className="grid gap-4">
        <div
          className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
          dir="rtl"
        >
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            نمایش {formatPersianNumber(firstEventNumber)} تا{" "}
            {formatPersianNumber(lastEventNumber)} از{" "}
            {formatPersianNumber(totalLogs)} رویداد
          </p>
          <AuditPagination
            currentPage={currentPage}
            params={params}
            totalPages={totalPages}
          />
        </div>

        {logs.length === 0 ? (
          <div
            className="rounded-lg border bg-card p-6 text-right text-sm text-muted-foreground"
            dir="rtl"
          >
            هیچ رویدادی با این فیلترها پیدا نشد.
          </div>
        ) : (
          logs.map((log) => <AuditLogCard key={log.id} log={log} />)
        )}

        <AuditPagination
          currentPage={currentPage}
          params={params}
          totalPages={totalPages}
        />
      </section>
    </div>
  );
}
