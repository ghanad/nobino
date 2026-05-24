import { AlternativeStatus, ReservationStatus } from "@prisma/client";
import { Check, History, X } from "lucide-react";
import Link from "next/link";

import {
  acceptAlternativeAction,
  cancelReservationByUserAction,
  createReservationAction,
  rejectAlternativeAction,
} from "@/app/reservations/actions";
import { PageHeader } from "@/components/app/page-header";
import { CreateReservationForm } from "@/components/reservation/create-reservation-form";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireCurrentUser } from "@/lib/auth";
import { getSlotUsage } from "@/lib/capacity-service";
import { db } from "@/lib/db";
import {
  formatJalaliDate,
  formatJalaliDateWithoutWeekday,
  formatJalaliDateWithoutYear,
  formatJalaliDateParam,
  parseJalaliDateParam,
} from "@/lib/jalali-date";
import { getWorkingWindowForDate } from "@/lib/schedule";
import { cn } from "@/lib/utils";

type ReservationsPageProps = {
  searchParams?: Promise<{
    alternativeAccepted?: string;
    alternativeRejected?: string;
    cancelled?: string;
    created?: string;
    date?: string;
    error?: string;
    reservationPage?: string;
  }>;
};

type MyReservation = {
  id: string;
  startAt: Date;
  endAt: Date;
  resourcePoolId: string;
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
    respondedAt: Date | null;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

type CalendarReservationDetail = {
  email: string | null;
  id: string;
  startAt: Date;
  endAt: Date;
  status: ReservationStatus;
  userId: string;
  userName: string | null;
};

const DISPLAY_TIME_FORMATTER = new Intl.DateTimeFormat("fa-IR", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
});

const ACTIVE_REJECTED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function formatNaturalJalaliDate(date: Date): string {
  return formatJalaliDate(date);
}

function formatWeekLabel(startDate: Date, endDate: Date): string {
  return `${formatNaturalJalaliDate(startDate)} تا ${formatNaturalJalaliDate(
    endDate,
  )}`;
}

function formatCalendarColumnLabel(date: Date): string {
  return formatJalaliDateWithoutYear(date);
}

function formatReservationDialogDate(date: Date): string {
  return formatJalaliDateWithoutWeekday(date);
}

function formatDisplayTime(date: Date): string {
  return DISPLAY_TIME_FORMATTER.format(date);
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

  return "bg-muted text-muted-foreground ring-border";
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

function ReservationTimeRange({
  endAt,
  startAt,
}: {
  endAt: Date;
  startAt: Date;
}) {
  return (
    <span dir="rtl">
      {formatNaturalJalaliDate(startAt)}، {formatDisplayTime(startAt)} تا{" "}
      {formatDisplayTime(endAt)}
    </span>
  );
}

function getAlternativeStatusClass(status: AlternativeStatus): string {
  if (status === AlternativeStatus.PROPOSED) {
    return "bg-sky-50 text-sky-800 ring-sky-200";
  }

  if (status === AlternativeStatus.ACCEPTED) {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }

  return "bg-muted text-muted-foreground ring-border";
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

function hasPendingAlternative(reservation: MyReservation): boolean {
  return reservation.alternatives.some(
    (alternative) => alternative.status === AlternativeStatus.PROPOSED,
  );
}

function isActiveReservation(reservation: MyReservation, now: Date): boolean {
  if (reservation.status === ReservationStatus.PENDING) {
    return true;
  }

  if (reservation.status === ReservationStatus.ALTERNATIVE_PROPOSED) {
    return hasPendingAlternative(reservation);
  }

  if (reservation.status === ReservationStatus.APPROVED) {
    return reservation.endAt.getTime() >= now.getTime();
  }

  if (reservation.status === ReservationStatus.REJECTED) {
    const isRecent =
      now.getTime() - reservation.updatedAt.getTime() <= ACTIVE_REJECTED_WINDOW_MS;

    return isRecent && Boolean(reservation.rejectionReason?.trim());
  }

  return false;
}

function getReservationsToast(
  params: Awaited<ReservationsPageProps["searchParams"]>,
) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  const successMessage =
    (params?.created &&
      "Reservation request created and sent for manager approval.") ||
    (params?.cancelled && "Pending reservation cancelled.") ||
    (params?.alternativeAccepted &&
      "Alternative accepted and reservation approved.") ||
    (params?.alternativeRejected && "Alternative rejected.");

  if (!successMessage) {
    return null;
  }

  return {
    consumeKeys: [
      "created",
      "cancelled",
      "alternativeAccepted",
      "alternativeRejected",
    ],
    message: successMessage,
    variant: "success" as const,
  };
}

function AlternativeList({
  reservation,
}: {
  reservation: MyReservation;
}) {
  const shouldShowAlternatives =
    reservation.status === ReservationStatus.ALTERNATIVE_PROPOSED ||
    reservation.status === ReservationStatus.REJECTED;

  if (!shouldShowAlternatives || reservation.alternatives.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        زمان پیشنهادی مدیر
      </p>
      <div className="grid gap-2">
        {reservation.alternatives.map((alternative) => {
          const canRespond =
            reservation.status === ReservationStatus.ALTERNATIVE_PROPOSED &&
            alternative.status === AlternativeStatus.PROPOSED;

          return (
            <div
              className="grid gap-2 rounded-md border bg-muted/30 p-2.5 sm:grid-cols-[1fr_auto]"
              key={alternative.id}
            >
              <div className="grid gap-1 text-sm">
                <div className="font-medium">
                  <ReservationTimeRange
                    endAt={alternative.proposedEndAt}
                    startAt={alternative.proposedStartAt}
                  />
                </div>
                <div>
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getAlternativeStatusClass(
                      alternative.status,
                    )}`}
                  >
                    {getAlternativeStatusLabel(alternative.status)}
                  </span>
                </div>
              </div>

              {canRespond ? (
                <div className="flex flex-wrap items-center gap-2">
                  <form action={acceptAlternativeAction}>
                    <input
                      name="alternativeId"
                      type="hidden"
                      value={alternative.id}
                    />
                    <SubmitButton pendingLabel="در حال ثبت..." size="sm">
                      <Check className="h-4 w-4" />
                      قبول زمان پیشنهادی
                    </SubmitButton>
                  </form>
                  <form action={rejectAlternativeAction}>
                    <input
                      name="alternativeId"
                      type="hidden"
                      value={alternative.id}
                    />
                    <SubmitButton
                      pendingLabel="در حال ثبت..."
                      size="sm"
                      variant="outline"
                    >
                      <X className="h-4 w-4" />
                      انتخاب زمان دیگر
                    </SubmitButton>
                  </form>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReservationCard({
  reservation,
}: {
  reservation: MyReservation;
}) {
  const isPending = reservation.status === ReservationStatus.PENDING;
  const canCancel = isPending;
  const showReason = Boolean(reservation.reason?.trim());
  const hasShortReason = (reservation.reason?.trim().length ?? 0) <= 90;
  const showRejectionReason =
    reservation.status === ReservationStatus.REJECTED &&
    Boolean(reservation.rejectionReason?.trim());
  const showAlternatives =
    (reservation.status === ReservationStatus.ALTERNATIVE_PROPOSED ||
      reservation.status === ReservationStatus.REJECTED) &&
    reservation.alternatives.length > 0;
  const showCardBody =
    showReason || showRejectionReason || showAlternatives || isPending;

  return (
    <article
      className={cn(
        "rounded-md border bg-card p-3 text-right text-card-foreground",
        isPending && "border-amber-200 bg-amber-50/40",
      )}
      dir="rtl"
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{reservation.resourcePool.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <ReservationTimeRange
              endAt={reservation.endAt}
              startAt={reservation.startAt}
            />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <span
            className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClass(
              reservation.status,
            )}`}
          >
            {getStatusLabel(reservation.status)}
          </span>

          {canCancel ? (
            <form action={cancelReservationByUserAction}>
              <input name="reservationId" type="hidden" value={reservation.id} />
              <SubmitButton
                className="h-8 px-2.5 text-xs"
                pendingLabel="در حال لغو..."
                size="sm"
                variant="outline"
              >
                <X className="h-3.5 w-3.5" />
                لغو درخواست
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </div>

      {showCardBody ? (
        <div className="mt-2 grid gap-2">
          {isPending ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
              این درخواست منتظر تایید مدیر است؛ تا قبل از تایید می‌توانید آن را لغو کنید.
            </p>
          ) : null}

          {showReason || showRejectionReason ? (
            <dl className="grid gap-1.5 text-xs">
              {showReason ? (
                <div
                  className={cn(
                    hasShortReason && "flex min-w-0 items-baseline gap-2",
                  )}
                >
                  <dt className="shrink-0 text-muted-foreground">دلیل درخواست</dt>
                  <dd
                    className={cn(
                      "leading-5",
                      hasShortReason
                        ? "min-w-0 truncate"
                        : "mt-1",
                    )}
                  >
                    {reservation.reason}
                  </dd>
                </div>
              ) : null}
              {showRejectionReason ? (
                <div>
                  <dt className="text-muted-foreground">دلیل رد</dt>
                  <dd className="mt-1 leading-5">
                    {reservation.rejectionReason}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          <AlternativeList reservation={reservation} />
        </div>
      ) : null}
    </article>
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

function getMyReservationForSlot(
  reservations: MyReservation[],
  slotStart: Date,
  slotEnd: Date,
): { id: string; status: "APPROVED" | "PENDING" } | null {
  const approvedReservation = reservations.find(
    (reservation) =>
      reservation.status === ReservationStatus.APPROVED &&
      reservation.startAt < slotEnd &&
      reservation.endAt > slotStart,
  );

  if (approvedReservation) {
    return {
      id: approvedReservation.id,
      status: "APPROVED",
    };
  }

  const pendingReservation = reservations.find(
    (reservation) =>
      reservation.status === ReservationStatus.PENDING &&
      reservation.startAt < slotEnd &&
      reservation.endAt > slotStart,
  );

  if (pendingReservation) {
    return {
      id: pendingReservation.id,
      status: "PENDING",
    };
  }

  return null;
}

function getReservationDetailsForSlot(
  reservations: CalendarReservationDetail[],
  slotStart: Date,
  slotEnd: Date,
  status: ReservationStatus,
) {
  return reservations
    .filter(
      (reservation) =>
        reservation.status === status &&
        reservation.startAt < slotEnd &&
        reservation.endAt > slotStart,
    )
    .map((reservation) => ({
      email: reservation.email,
      id: reservation.id,
      userId: reservation.userId,
      userName: reservation.userName,
    }));
}

function getReservationDurationHours(reservation: Pick<MyReservation, "startAt" | "endAt">): number {
  return (reservation.endAt.getTime() - reservation.startAt.getTime()) / (60 * 60 * 1000);
}

export default async function ReservationsPage({
  searchParams,
}: ReservationsPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const toast = getReservationsToast(params);
  const selectedDate = parseJalaliDateParam(params?.date) ?? new Date();
  const dateParam = formatJalaliDateParam(selectedDate);
  const weekStart = getWeekStart(selectedDate);
  const weekEnd = addDays(weekStart, 7);
  const weekDates = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  );
  const [resourcePools, reservationPolicy, reservations] = await Promise.all([
    db.resourcePool.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        capacity: true,
      },
    }),
    db.reservationPolicy.findUnique({
      where: { id: "default" },
      select: {
        dailyUserHourLimit: true,
        oneReservationPerDayEnabled: true,
      },
    }),
    db.reservation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        resourcePoolId: true,
        status: true,
        reason: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true,
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
            respondedAt: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);
  const selectedResourcePool = resourcePools[0];
  const dailyUserHourLimit = reservationPolicy?.dailyUserHourLimit ?? 3;
  const oneReservationPerDayEnabled =
    reservationPolicy?.oneReservationPerDayEnabled ?? true;
  const dailyReservedHoursByDate = reservations.reduce<Record<string, number>>(
    (hoursByDate, reservation) => {
      if (
        reservation.status !== ReservationStatus.PENDING &&
        reservation.status !== ReservationStatus.APPROVED &&
        reservation.status !== ReservationStatus.ALTERNATIVE_PROPOSED
      ) {
        return hoursByDate;
      }

      const date = formatJalaliDateParam(reservation.startAt);
      hoursByDate[date] =
        (hoursByDate[date] ?? 0) + getReservationDurationHours(reservation);

      return hoursByDate;
    },
    {},
  );
  const dailyActiveReservationCountByDate = reservations.reduce<Record<string, number>>(
    (countByDate, reservation) => {
      if (
        reservation.status !== ReservationStatus.PENDING &&
        reservation.status !== ReservationStatus.APPROVED &&
        reservation.status !== ReservationStatus.ALTERNATIVE_PROPOSED
      ) {
        return countByDate;
      }

      const date = formatJalaliDateParam(reservation.startAt);
      countByDate[date] = (countByDate[date] ?? 0) + 1;

      return countByDate;
    },
    {},
  );
  const selectedPoolReservations = selectedResourcePool
    ? reservations.filter(
        (reservation) => reservation.resourcePoolId === selectedResourcePool.id,
      )
    : [];
  const selectedPoolCalendarReservations: CalendarReservationDetail[] =
    selectedResourcePool
      ? await db.reservation.findMany({
          where: {
            resourcePoolId: selectedResourcePool.id,
            startAt: { lt: weekEnd },
            endAt: { gt: weekStart },
            status: {
              in: [ReservationStatus.APPROVED, ReservationStatus.PENDING],
            },
          },
          orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            startAt: true,
            endAt: true,
            status: true,
            userId: true,
            user: {
              select: {
                email: true,
                name: true,
              },
            },
          },
        }).then((items) =>
          items.map((reservation) => ({
            email: reservation.user.email,
            id: reservation.id,
            startAt: reservation.startAt,
            endAt: reservation.endAt,
            status: reservation.status,
            userId: reservation.userId,
            userName: reservation.user.name,
          })),
        )
      : [];
  const now = new Date();
  const activeReservations = reservations.filter((reservation) =>
    isActiveReservation(reservation, now),
  );
  const weekDays = selectedResourcePool
    ? await Promise.all(
        weekDates.map(async (date) => {
          const workingWindow = await getWorkingWindowForDate(date);
          const slots =
            workingWindow.isWorkingDay &&
            workingWindow.startTime &&
            workingWindow.endTime
              ? await getSlotUsage({
                  resourcePoolId: selectedResourcePool.id,
                  startAt: buildDateAtTime(date, workingWindow.startTime),
                  endAt: buildDateAtTime(date, workingWindow.endTime),
                })
              : [];

          return {
            closedReason: !workingWindow.isWorkingDay
              ? workingWindow.reason ?? "روز غیرکاری"
              : null,
            dateLabel: formatJalaliDate(date),
            modalDateLabel: formatReservationDialogDate(date),
            dateParam: formatJalaliDateParam(date),
            shortLabel: formatCalendarColumnLabel(date),
            slots: slots.map((slot) => {
              const isPast = slot.slotStart.getTime() < now.getTime();
              const isFull = slot.approvedCount >= slot.capacity;
              const unavailableReason: "past" | "full" | null = isPast
                ? "past"
                : isFull
                  ? "full"
                  : null;

              const myReservation = getMyReservationForSlot(
                selectedPoolReservations,
                slot.slotStart,
                slot.slotEnd,
              );

              return {
                slotStartHour: slot.slotStart.getHours(),
                slotEndHour: slot.slotEnd.getHours(),
                approvedCount: slot.approvedCount,
                approvedReservations: getReservationDetailsForSlot(
                  selectedPoolCalendarReservations,
                  slot.slotStart,
                  slot.slotEnd,
                  ReservationStatus.APPROVED,
                ),
                pendingCount: slot.pendingCount,
                pendingReservations: getReservationDetailsForSlot(
                  selectedPoolCalendarReservations,
                  slot.slotStart,
                  slot.slotEnd,
                  ReservationStatus.PENDING,
                ),
                capacity: slot.capacity,
                isRequestable: !isPast && !isFull,
                myReservationId: myReservation?.id ?? null,
                myReservationStatus: myReservation?.status ?? null,
                unavailableReason,
              };
            }),
          };
        }),
      )
    : weekDates.map((date) => ({
        closedReason: null,
        dateLabel: formatJalaliDate(date),
        modalDateLabel: formatReservationDialogDate(date),
        dateParam: formatJalaliDateParam(date),
        shortLabel: formatCalendarColumnLabel(date),
        slots: [],
      }));

  return (
    <div className="grid gap-6">
      <PageHeader
        subtitle="درخواست رزرو جدید و مشاهده ظرفیت سیستم‌ها"
        title="رزروها"
      />

      {toast ? <UrlToast {...toast} /> : null}

      <CreateReservationForm
        action={createReservationAction}
        currentDateParam={dateParam}
        dailyActiveReservationCountByDate={dailyActiveReservationCountByDate}
        dailyReservedHoursByDate={dailyReservedHoursByDate}
        dailyUserHourLimit={dailyUserHourLimit}
        emptyMessage={
          selectedResourcePool
            ? "No working-hour slots are configured for this week."
            : "No active resource pool is configured."
        }
        nextWeekDateParam={formatJalaliDateParam(addDays(weekStart, 7))}
        previousWeekDateParam={formatJalaliDateParam(addDays(weekStart, -7))}
        oneReservationPerDayEnabled={oneReservationPerDayEnabled}
        resourcePools={resourcePools}
        weekDays={weekDays}
        weekLabel={formatWeekLabel(weekDates[0], weekDates[6])}
      />

      <section className="rounded-lg border bg-card p-5 text-right" dir="rtl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="font-medium">درخواست‌های فعال من</h2>
            <p className="text-sm text-muted-foreground">
              وضعیت رزروهای فعال و موارد نیازمند اقدام را پیگیری کنید.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/reservations/history">
              <History className="h-4 w-4" />
              مشاهده تاریخچه رزروها
            </Link>
          </Button>
        </div>

        {activeReservations.length === 0 ? (
          <div className="mt-5 rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">رزرو فعالی ندارید.</p>
            <p className="mt-1">
              برای ثبت درخواست جدید، یک بازه زمانی از تقویم انتخاب کنید.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            {activeReservations.map((reservation) => (
              <ReservationCard key={reservation.id} reservation={reservation} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
