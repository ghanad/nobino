import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  formatPersianNumber,
  getAuditPageHref,
  type AuditSearchParams,
} from "./audit-helpers";

type AuditPaginationProps = {
  currentPage: number;
  params: AuditSearchParams | undefined;
  totalPages: number;
};

export function AuditPagination({
  currentPage,
  params,
  totalPages,
}: AuditPaginationProps) {
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
