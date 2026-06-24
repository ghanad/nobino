import { AlternativeStatus, ReservationStatus } from "@prisma/client";
import { X } from "lucide-react";

import { PendingReviewModalContent } from "@/app/manager/pending-review-modal-content";
import { ReviewModalCloseLink } from "@/app/manager/review-modal-close-link";
import { PageHeader } from "@/components/app/page-header";
import { ManagerWeeklyCalendar } from "@/components/calendar/manager-weekly-calendar";
import { UrlToast } from "@/components/ui/url-toast";
import { getSlotUsage } from "@/lib/capacity-service";
import { db } from "@/lib/db";
import {
  formatJalaliDate,
  formatJalaliDateParam,
  getJalaliDisplayParts,
  parseJalaliDateParam,
} from "@/lib/jalali-date";
import { getWorkingWindowForDate } from "@/lib/schedule";

type ManagerPageProps = {
  searchParams?: Promise<{
    alternative?: string;
    approved?: string;
    cancelled?: string;
    date?: string;
    error?: string;
    rejected?: string;
  }>;
};

type QueueReservation = {
  id: string;
  autoAcceptAt: Date | null;
  resourcePoolId: string;
  startAt: Date;
  endAt: Date;
  partySize: number;
  status: ReservationStatus;
  reason: string | null;
  createdAt: Date;
  user: {
    name: string;
    email: string;
  };
  resourcePool: {
    name: string;
  };
};

type CalendarReservation = QueueReservation & {
  alternatives: Array<{
    proposedStartAt: Date;
    proposedEndAt: Date;
    status: AlternativeStatus;
  }>;
};

type QueueItem = {
  reservation: QueueReservation;
};

const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR");
const PERSIAN_TIME_FORMATTER = new Intl.DateTimeFormat("fa-IR", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
});

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

function getWeekStart(date: Date): Date {
  const daysSinceSaturday = (date.getDay() + 1) % 7;

  return addDays(date, -daysSinceSaturday);
}

function buildDateAtTime(date: Date, time: string): Date {
  const [hour, minute] = time.split(":").map(Number);

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
    0,
    0,
  );
}

function formatDuration(startAt: Date, endAt: Date): string {
  const hours = Math.round((endAt.getTime() - startAt.getTime()) / 3_600_000);

  return `${formatPersianNumber(hours)} ساعت`;
}

function formatPersianNumber(value: number): string {
  return PERSIAN_NUMBER_FORMATTER.format(value);
}

function formatPersianTime(date: Date): string {
  return PERSIAN_TIME_FORMATTER.format(date);
}

function buildHourOptions() {
  return Array.from({ length: 24 }, (_, hour) => hour);
}

function buildReviewModalId(reservationId: string): string {
  return `review-reservation-${reservationId}`;
}

function buildManagerHref(dateParam: string): string {
  return `/manager?date=${encodeURIComponent(dateParam)}`;
}

function formatWeekLabel(startDate: Date, endDate: Date): string {
  const start = getJalaliDisplayParts(startDate);
  const end = getJalaliDisplayParts(endDate);
  const isSameMonth = start.year === end.year && start.month === end.month;
  const isSameYear = start.year === end.year;

  if (isSameMonth) {
    return `${start.dayLabel} تا ${end.dayLabel} ${end.monthLabel} ${end.yearLabel}`;
  }

  if (isSameYear) {
    return `${start.dayLabel} ${start.monthLabel} تا ${end.dayLabel} ${end.monthLabel} ${end.yearLabel}`;
  }

  return `${start.dayLabel} ${start.monthLabel} ${start.yearLabel} تا ${end.dayLabel} ${end.monthLabel} ${end.yearLabel}`;
}

function isSameJalaliMonth(dates: Date[]): boolean {
  if (dates.length === 0) {
    return true;
  }

  const first = getJalaliDisplayParts(dates[0]);

  return dates.every((date) => {
    const parts = getJalaliDisplayParts(date);

    return parts.year === first.year && parts.month === first.month;
  });
}

function formatCalendarColumnLabel(date: Date, includeMonth: boolean): string {
  const parts = getJalaliDisplayParts(date);

  return [
    parts.weekdayLabel,
    parts.dayLabel,
    includeMonth ? parts.monthLabel : null,
  ].filter(Boolean).join(" ");
}

function getCalendarReservationRange(reservation: CalendarReservation): {
  endAt: Date;
  startAt: Date;
} {
  const proposedAlternative = reservation.alternatives.find(
    (alternative) => alternative.status === AlternativeStatus.PROPOSED,
  );

  if (
    reservation.status === ReservationStatus.ALTERNATIVE_PROPOSED &&
    proposedAlternative
  ) {
    return {
      startAt: proposedAlternative.proposedStartAt,
      endAt: proposedAlternative.proposedEndAt,
    };
  }

  return {
    startAt: reservation.startAt,
    endAt: reservation.endAt,
  };
}

function getQueueToast(params: Awaited<ManagerPageProps["searchParams"]>) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  const successMessage =
    (params?.approved && "رزرو تایید شد.") ||
    (params?.cancelled && "رزرو لغو شد.") ||
    (params?.rejected && "رزرو رد شد.") ||
    (params?.alternative && "زمان رزرو به‌روزرسانی شد.");

  return successMessage
    ? {
        consumeKeys: ["approved", "cancelled", "rejected", "alternative"],
        message: successMessage,
        variant: "success" as const,
      }
    : null;
}

function ReviewModal({
  item,
  dateParam,
  autoAcceptEnabled,
}: {
  item: QueueItem;
  dateParam: string;
  autoAcceptEnabled: boolean;
}) {
  const isPending = item.reservation.status === ReservationStatus.PENDING;
  const modalId = buildReviewModalId(item.reservation.id);
  const modalTitle = isPending
    ? "بررسی درخواست رزرو"
    : "جزئیات رزرو تاییدشده";

  return (
    <div
      aria-labelledby={`${modalId}-title`}
      aria-modal="true"
      className="fixed inset-0 z-50 hidden items-start justify-center overflow-y-auto bg-black/55 p-4 target:flex data-[closed=true]:!hidden"
      dir="rtl"
      id={modalId}
      role="dialog"
    >
      <ReviewModalCloseLink
        aria-label="بستن پنجره بررسی"
        className="fixed inset-0 cursor-default"
        closeHref={buildManagerHref(dateParam)}
        modalId={modalId}
      />
      <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-lg border bg-background text-right shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2
            className="text-base font-semibold"
            id={`${modalId}-title`}
          >
            {modalTitle}
          </h2>
          <ReviewModalCloseLink
            aria-label="بستن پنجره بررسی"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            closeHref={buildManagerHref(dateParam)}
            modalId={modalId}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </ReviewModalCloseLink>
        </div>
        <PendingReviewModalContent
          autoAcceptAt={item.reservation.autoAcceptAt}
          autoAcceptEnabled={autoAcceptEnabled}
          defaultEndHour={item.reservation.endAt.getHours()}
          defaultStartHour={item.reservation.startAt.getHours()}
          durationLabel={formatDuration(
            item.reservation.startAt,
            item.reservation.endAt,
          )}
          hourOptions={buildHourOptions()}
          partySizeLabel={formatPersianNumber(item.reservation.partySize)}
          reason={item.reservation.reason}
          requestedDate={formatJalaliDateParam(item.reservation.startAt)}
          requestedDateLabel={formatJalaliDate(item.reservation.startAt)}
          requestedEndTimeLabel={formatPersianTime(item.reservation.endAt)}
          requestedStartTimeLabel={formatPersianTime(item.reservation.startAt)}
          reservationId={item.reservation.id}
          resourcePoolName={item.reservation.resourcePool.name}
          status={item.reservation.status}
          userEmail={item.reservation.user.email}
          userName={item.reservation.user.name}
        />
      </div>
    </div>
  );
}

export default async function ManagerPage({ searchParams }: ManagerPageProps) {
  const params = await searchParams;
  const toast = getQueueToast(params);
  const now = new Date();
  const selectedDate = parseJalaliDateParam(params?.date) ?? now;
  const dateParam = formatJalaliDateParam(selectedDate);
  const weekStart = getWeekStart(selectedDate);
  const weekDates = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  );
  const weekSpansMultipleJalaliMonths = !isSameJalaliMonth(weekDates);
  const weekRangeEnd = addDays(weekStart, 7);
  const resourcePool = await db.resourcePool.findFirst({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
    },
  });
  const reservationPolicy = await db.reservationPolicy.findUnique({
    where: { id: "default" },
    select: {
      autoAcceptDelayHours: true,
      autoAcceptEnabled: true,
    },
  });
  const weekReservations: CalendarReservation[] =
    resourcePool
      ? await db.reservation.findMany({
          where: {
            resourcePoolId: resourcePool.id,
            OR: [
              {
                startAt: { lt: weekRangeEnd },
                endAt: { gt: weekStart },
                status: {
                  in: [ReservationStatus.APPROVED, ReservationStatus.PENDING],
                },
              },
              {
                status: ReservationStatus.ALTERNATIVE_PROPOSED,
                alternatives: {
                  some: {
                    status: AlternativeStatus.PROPOSED,
                    proposedStartAt: { lt: weekRangeEnd },
                    proposedEndAt: { gt: weekStart },
                  },
                },
              },
            ],
          },
          orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            autoAcceptAt: true,
            resourcePoolId: true,
            startAt: true,
            endAt: true,
            partySize: true,
            status: true,
            reason: true,
            createdAt: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
            resourcePool: {
              select: {
                name: true,
              },
            },
            alternatives: {
              where: { status: AlternativeStatus.PROPOSED },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                proposedStartAt: true,
                proposedEndAt: true,
                status: true,
              },
            },
          },
        })
      : [];
  const weekDays = resourcePool
    ? await Promise.all(
        weekDates.map(async (date) => {
          const workingWindow = await getWorkingWindowForDate(date);
          const slots =
            workingWindow.isWorkingDay &&
            workingWindow.startTime &&
            workingWindow.endTime
              ? await getSlotUsage({
                  resourcePoolId: resourcePool.id,
                  startAt: buildDateAtTime(date, workingWindow.startTime),
                  endAt: buildDateAtTime(date, workingWindow.endTime),
                })
              : [];

          return {
            closedReason: !workingWindow.isWorkingDay
              ? workingWindow.reason ?? "روز غیرکاری"
              : null,
            dateLabel: formatJalaliDate(date),
            dateParam: formatJalaliDateParam(date),
            shortLabel: formatCalendarColumnLabel(
              date,
              weekSpansMultipleJalaliMonths,
            ),
            slots: slots.map((slot) => {
              const details = weekReservations
                .map((reservation) => ({
                  reservation,
                  range: getCalendarReservationRange(reservation),
                }))
                .filter(
                  ({ range }) =>
                    range.startAt < slot.slotEnd && range.endAt > slot.slotStart,
                )
                .map((reservation) => ({
                  id: reservation.reservation.id,
                  userName: reservation.reservation.user.name,
                  partySize: reservation.reservation.partySize,
                  status:
                    reservation.reservation.status === ReservationStatus.APPROVED
                      ? ("APPROVED" as const)
                      : reservation.reservation.status ===
                          ReservationStatus.ALTERNATIVE_PROPOSED
                        ? ("ALTERNATIVE_PROPOSED" as const)
                        : ("PENDING" as const),
                  reason: reservation.reservation.reason,
                  href:
                    reservation.reservation.status ===
                    ReservationStatus.ALTERNATIVE_PROPOSED
                      ? undefined
                      : `#${buildReviewModalId(reservation.reservation.id)}`,
                }));

              return {
                slotStartHour: slot.slotStart.getHours(),
                slotEndHour: slot.slotEnd.getHours(),
                approvedCount: slot.approvedCount,
                pendingCount: slot.pendingCount,
                capacity: slot.capacity,
                details,
              };
            }),
          };
        }),
      )
    : weekDates.map((date) => ({
        closedReason: null,
        dateLabel: formatJalaliDate(date),
        dateParam: formatJalaliDateParam(date),
        shortLabel: formatCalendarColumnLabel(
          date,
          weekSpansMultipleJalaliMonths,
        ),
        slots: [],
      }));
  const pendingReservations: QueueReservation[] = await db.reservation.findMany({
    where: {
      status: ReservationStatus.PENDING,
    },
    orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      autoAcceptAt: true,
      resourcePoolId: true,
      startAt: true,
      endAt: true,
      partySize: true,
      status: true,
      reason: true,
      createdAt: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
      resourcePool: {
        select: {
          name: true,
        },
      },
    },
  });
  const queueItems: QueueItem[] = pendingReservations.map((reservation) => ({
    reservation,
  }));
  const approvedCalendarItems: QueueItem[] = weekReservations
    .filter((reservation) => reservation.status === ReservationStatus.APPROVED)
    .map((reservation) => ({ reservation }));
  const modalItems = [...queueItems, ...approvedCalendarItems];

  return (
    <div className="grid gap-6">
      <PageHeader
        subtitle="درخواست‌های رزرو را بررسی، تایید یا رد کنید"
        title="بررسی درخواست‌ها"
      />

      {toast ? <UrlToast {...toast} /> : null}

      <section className="grid gap-3">
        <ManagerWeeklyCalendar
          currentDateParam={dateParam}
          emptyMessage={
            resourcePool
              ? "هیچ بازه ساعت کاری برای این هفته تنظیم نشده است."
              : "هیچ مجموعه منبع فعالی تنظیم نشده است."
          }
          nextWeekDateParam={formatJalaliDateParam(addDays(weekStart, 7))}
          previousWeekDateParam={formatJalaliDateParam(addDays(weekStart, -7))}
          todayDateParam={formatJalaliDateParam(now)}
          weekDays={weekDays}
          weekLabel={formatWeekLabel(weekDates[0], weekDates[6])}
        />
        {modalItems.map((item) => (
          <ReviewModal
            dateParam={dateParam}
            item={item}
            autoAcceptEnabled={reservationPolicy?.autoAcceptEnabled ?? false}
            key={`review-modal-${item.reservation.id}`}
          />
        ))}
      </section>

      {queueItems.length === 0 ? (
        <section className="rounded-lg border bg-card p-5 text-card-foreground">
          <h2 className="font-medium">صف بررسی تایید</h2>
          <p className="mt-5 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
            هیچ درخواست رزروی در انتظار تایید نیست.
          </p>
        </section>
      ) : null}
    </div>
  );
}
