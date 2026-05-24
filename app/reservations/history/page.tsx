import { AlternativeStatus, ReservationStatus } from "@prisma/client";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatJalaliDate } from "@/lib/jalali-date";

type ReservationHistoryItem = {
  id: string;
  startAt: Date;
  endAt: Date;
  status: ReservationStatus;
  reason: string | null;
  rejectionReason: string | null;
  resourcePool: {
    name: string;
  };
  alternatives: Array<{
    id: string;
    proposedStartAt: Date;
    proposedEndAt: Date;
    status: AlternativeStatus;
  }>;
};

const DISPLAY_TIME_FORMATTER = new Intl.DateTimeFormat("fa-IR", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
});

function formatDisplayTime(date: Date): string {
  return DISPLAY_TIME_FORMATTER.format(date);
}

function ReservationTimeRange({
  endAt,
  startAt,
}: {
  endAt: Date;
  startAt: Date;
}) {
  return (
    <span dir="rtl">
      {formatJalaliDate(startAt)}، {formatDisplayTime(startAt)} تا{" "}
      {formatDisplayTime(endAt)}
    </span>
  );
}

function getStatusClass(status: ReservationStatus): string {
  if (status === ReservationStatus.PENDING) {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (status === ReservationStatus.APPROVED) {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }

  if (status === ReservationStatus.REJECTED) {
    return "bg-rose-50 text-rose-800 ring-rose-200";
  }

  if (status === ReservationStatus.ALTERNATIVE_PROPOSED) {
    return "bg-sky-50 text-sky-800 ring-sky-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function getStatusLabel(status: ReservationStatus): string {
  if (status === ReservationStatus.PENDING) {
    return "در انتظار تایید";
  }

  if (status === ReservationStatus.APPROVED) {
    return "تایید شده";
  }

  if (status === ReservationStatus.REJECTED) {
    return "رد شده";
  }

  if (status === ReservationStatus.CANCELLED_BY_USER) {
    return "لغو شده توسط شما";
  }

  if (status === ReservationStatus.CANCELLED_BY_ADMIN) {
    return "لغو شده توسط مدیر";
  }

  return "نیازمند اقدام";
}

function getAlternativeStatusLabel(status: AlternativeStatus): string {
  if (status === AlternativeStatus.PROPOSED) {
    return "پیشنهاد شده";
  }

  if (status === AlternativeStatus.ACCEPTED) {
    return "پذیرفته شده";
  }

  if (status === AlternativeStatus.REJECTED) {
    return "رد شده";
  }

  return "منقضی شده";
}

function ReservationHistoryCard({
  reservation,
}: {
  reservation: ReservationHistoryItem;
}) {
  return (
    <article
      className="rounded-md border bg-card p-3 text-right text-card-foreground"
      dir="rtl"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-medium">{reservation.resourcePool.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            <ReservationTimeRange
              endAt={reservation.endAt}
              startAt={reservation.startAt}
            />
          </p>
        </div>
        <span
          className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClass(
            reservation.status,
          )}`}
        >
          {getStatusLabel(reservation.status)}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs">
        {reservation.reason?.trim() ? (
          <div>
            <p className="text-muted-foreground">دلیل درخواست</p>
            <p className="mt-1 leading-5">{reservation.reason}</p>
          </div>
        ) : null}
        {reservation.status === ReservationStatus.REJECTED &&
        reservation.rejectionReason?.trim() ? (
          <div>
            <p className="text-muted-foreground">دلیل رد</p>
            <p className="mt-1 leading-5">{reservation.rejectionReason}</p>
          </div>
        ) : null}
        {reservation.alternatives.length > 0 ? (
          <div className="grid gap-1.5">
            <p className="text-muted-foreground">زمان‌های پیشنهادی مدیر</p>
            <div className="grid gap-1.5">
              {reservation.alternatives.map((alternative) => (
                <div
                  className="flex flex-col gap-1 rounded-md border bg-muted/30 p-2 sm:flex-row sm:items-center sm:justify-between"
                  key={alternative.id}
                >
                  <span>
                    <ReservationTimeRange
                      endAt={alternative.proposedEndAt}
                      startAt={alternative.proposedStartAt}
                    />
                  </span>
                  <span className="text-muted-foreground">
                    {getAlternativeStatusLabel(alternative.status)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default async function ReservationHistoryPage() {
  const user = await requireCurrentUser();
  const reservations = await db.reservation.findMany({
    where: { userId: user.id },
    orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      reason: true,
      rejectionReason: true,
      resourcePool: {
        select: {
          name: true,
        },
      },
      alternatives: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          proposedStartAt: true,
          proposedEndAt: true,
          status: true,
        },
      },
    },
  });

  return (
    <div className="grid gap-6 text-right" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">تاریخچه رزروها</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            همه درخواست‌ها، رزروهای گذشته، لغوشده‌ها و موارد ردشده اینجا نمایش
            داده می‌شوند.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/reservations">
            <ArrowRight className="h-4 w-4" />
            بازگشت به تقویم
          </Link>
        </Button>
      </div>

      {reservations.length === 0 ? (
        <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
          هنوز رزروی ثبت نشده است.
        </div>
      ) : (
        <section className="grid gap-3">
          {reservations.map((reservation) => (
            <ReservationHistoryCard
              key={reservation.id}
              reservation={reservation}
            />
          ))}
        </section>
      )}
    </div>
  );
}
