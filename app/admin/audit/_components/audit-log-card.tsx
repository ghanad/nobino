import { formatJalaliDateTime } from "@/lib/jalali-date";

import {
  ACTION_LABELS,
  buildAuditDescription,
  ENTITY_LABELS,
  formatChangeRows,
  shortId,
  stringifyAuditValue,
  type AuditLogRow,
} from "./audit-helpers";

export function AuditLogCard({ log }: { log: AuditLogRow }) {
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
