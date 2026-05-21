import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Filter, RotateCcw } from "lucide-react";

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

function stringifyAuditValue(value: Prisma.JsonValue | null): string {
  if (value === null) {
    return "None";
  }

  return JSON.stringify(value, null, 2);
}

function ValueBlock({
  label,
  value,
}: {
  label: string;
  value: Prisma.JsonValue | null;
}) {
  if (value === null) {
    return null;
  }

  return (
    <div className="grid gap-2">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
        {stringifyAuditValue(value)}
      </pre>
    </div>
  );
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
      <form className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_150px_150px_auto_auto]">
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

        <div className="flex items-end">
          <Button type="submit">
            <Filter className="h-4 w-4" />
            Filter
          </Button>
        </div>

        <div className="flex items-end">
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
  return (
    <article className="rounded-lg border bg-card p-5 text-card-foreground">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium">{log.action}</h2>
            <span className="rounded-full bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
              {log.entityType}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatJalaliDateTime(log.createdAt)}
          </p>
        </div>
        <div className="text-sm lg:text-right">
          <p className="font-medium">{log.actor?.name ?? "System"}</p>
          <p className="mt-1 text-muted-foreground">
            {log.actor?.email ?? "No actor recorded"}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Entity ID</dt>
          <dd className="mt-1 break-all font-mono text-xs">{log.entityId}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Log ID</dt>
          <dd className="mt-1 break-all font-mono text-xs">{log.id}</dd>
        </div>
      </dl>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ValueBlock label="Old value" value={log.oldValue} />
        <ValueBlock label="New value" value={log.newValue} />
      </div>
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
            Review reservation approvals, capacity updates, schedule changes,
            and user-management events.
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
          <p className="text-sm text-muted-foreground">
            Showing latest {logs.length} matching audit events.
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
