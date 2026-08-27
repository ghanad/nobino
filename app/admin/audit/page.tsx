import { UserRole } from "@prisma/client";
import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { AuditEmptyState } from "./_components/audit-empty-state";
import { AuditFilters } from "./_components/audit-filters";
import {
  AUDIT_PAGE_SIZE,
  buildAuditWhere,
  formatPersianNumber,
  getAuditPage,
  type AuditSearchParams,
  uniqueSorted,
} from "./_components/audit-helpers";
import { AuditLogCard } from "./_components/audit-log-card";
import { AuditPagination } from "./_components/audit-pagination";

type AuditPageProps = {
  searchParams?: Promise<AuditSearchParams>;
};

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
            <Link href="/admin/users">بازگشت به مدیریت</Link>
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
          <AuditEmptyState />
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
