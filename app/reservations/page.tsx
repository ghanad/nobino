import {
  AlternativeStatus,
  LunchReservationStatus,
  ReservationStatus,
} from "@prisma/client";

import {
  cancelLunchReservationAction,
  createLunchReservationAction,
} from "@/app/lunch/actions";
import { createReservationInlineAction } from "@/app/reservations/actions";
import { ReservationsInteractiveSection } from "@/app/reservations/reservations-interactive-section";
import { PageHeader } from "@/components/app/page-header";
import { UrlToast } from "@/components/ui/url-toast";
import { requireCurrentUser } from "@/lib/auth";
import { getSlotUsage } from "@/lib/capacity-service";
import { db } from "@/lib/db";
import {
  formatJalaliDate,
  formatJalaliDateWithoutWeekday,
  formatJalaliDateParam,
  formatPersianLocalTime,
  getJalaliDisplayParts,
  parseJalaliDateParam,
} from "@/lib/jalali-date";
import { getLunchDayState } from "@/lib/lunch-service";
import { getWorkingWindowForDate } from "@/lib/schedule";

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
  autoAcceptAt: Date | null;
  startAt: Date;
  endAt: Date;
  partySize: number;
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
  partySize: number;
  status: ReservationStatus;
  userId: string;
  userName: string | null;
};

type CalendarReservationSource = CalendarReservationDetail & {
  alternatives: Array<{
    proposedStartAt: Date;
    proposedEndAt: Date;
    status: AlternativeStatus;
  }>;
};

const ACTIVE_REJECTED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

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

function formatReservationDialogDate(date: Date): string {
  return formatJalaliDateWithoutWeekday(date);
}

function hasPendingAlternative(reservation: MyReservation): boolean {
  return reservation.alternatives.some(
    (alternative) => alternative.status === AlternativeStatus.PROPOSED,
  );
}

function getProposedAlternative(
  reservation: {
    alternatives: Array<{
      proposedStartAt: Date;
      proposedEndAt: Date;
      status: AlternativeStatus;
    }>;
  },
) {
  return reservation.alternatives.find(
    (alternative) => alternative.status === AlternativeStatus.PROPOSED,
  );
}

function getActiveReservationRange(
  reservation: {
    alternatives: Array<{
      proposedStartAt: Date;
      proposedEndAt: Date;
      status: AlternativeStatus;
    }>;
    endAt: Date;
    startAt: Date;
    status: ReservationStatus;
  },
): { endAt: Date; startAt: Date } {
  const proposedAlternative = getProposedAlternative(reservation);

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
    (params?.created && "درخواست رزرو ثبت شد و در انتظار بررسی است.") ||
    (params?.cancelled && "رزرو لغو شد و ظرفیت آن آزاد شد.") ||
    (params?.alternativeAccepted &&
      "زمان جایگزین پذیرفته شد و رزرو تایید شد.") ||
    (params?.alternativeRejected && "زمان جایگزین رد شد.");

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
): {
  id: string;
  status: "ALTERNATIVE_PROPOSED" | "APPROVED" | "PENDING";
} | null {
  const approvedReservation = reservations.find(
    (reservation) => {
      const range = getActiveReservationRange(reservation);

      return (
        reservation.status === ReservationStatus.APPROVED &&
        range.startAt < slotEnd &&
        range.endAt > slotStart
      );
    },
  );

  if (approvedReservation) {
    return {
      id: approvedReservation.id,
      status: "APPROVED",
    };
  }

  const pendingReservation = reservations.find(
    (reservation) => {
      const range = getActiveReservationRange(reservation);

      return (
        reservation.status === ReservationStatus.PENDING &&
        range.startAt < slotEnd &&
        range.endAt > slotStart
      );
    },
  );

  if (pendingReservation) {
    return {
      id: pendingReservation.id,
      status: "PENDING",
    };
  }

  const proposedReservation = reservations.find((reservation) => {
    const range = getActiveReservationRange(reservation);

    return (
      reservation.status === ReservationStatus.ALTERNATIVE_PROPOSED &&
      range.startAt < slotEnd &&
      range.endAt > slotStart
    );
  });

  if (proposedReservation) {
    return {
      id: proposedReservation.id,
      status: "ALTERNATIVE_PROPOSED",
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
      partySize: reservation.partySize,
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
  const now = new Date();
  const selectedDate = parseJalaliDateParam(params?.date) ?? now;
  const dateParam = formatJalaliDateParam(selectedDate);
  const weekStart = getWeekStart(selectedDate);
  const weekEnd = addDays(weekStart, 7);
  const weekDates = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  );
  const weekSpansMultipleJalaliMonths = !isSameJalaliMonth(weekDates);
  const [resourcePools, reservationPolicy, reservations, buildings] =
    await Promise.all([
    db.resourcePool.findMany({
      where: {
        active: true,
        building: { active: true, deletedAt: null, isTransitional: false },
      },
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
        autoAcceptEnabled: true,
        dailyUserHourLimit: true,
        oneReservationPerDayEnabled: true,
      },
    }),
    db.reservation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        autoAcceptAt: true,
        startAt: true,
        endAt: true,
        partySize: true,
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
    db.building.findMany({
      where: { active: true, isTransitional: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
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

      const range = getActiveReservationRange(reservation);
      const date = formatJalaliDateParam(range.startAt);
      hoursByDate[date] =
        (hoursByDate[date] ?? 0) + getReservationDurationHours(range);

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

      const range = getActiveReservationRange(reservation);
      const date = formatJalaliDateParam(range.startAt);
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
            OR: [
              {
                startAt: { lt: weekEnd },
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
                    proposedStartAt: { lt: weekEnd },
                    proposedEndAt: { gt: weekStart },
                  },
                },
              },
            ],
          },
          orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            startAt: true,
            endAt: true,
            partySize: true,
            status: true,
            userId: true,
            user: {
              select: {
                email: true,
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
        }).then((items) =>
          items
            .map((reservation) => {
              const source: CalendarReservationSource = {
                email: reservation.user.email,
                id: reservation.id,
                startAt: reservation.startAt,
                endAt: reservation.endAt,
                partySize: reservation.partySize,
                status: reservation.status,
                userId: reservation.userId,
                userName: reservation.user.name,
                alternatives: reservation.alternatives,
              };
              const range = getActiveReservationRange(source);

              return {
                email: source.email,
                id: source.id,
                startAt: range.startAt,
                endAt: range.endAt,
                partySize: source.partySize,
                status: source.status,
                userId: source.userId,
                userName: source.userName,
              };
            })
            .filter(
              (reservation) =>
                reservation.startAt < weekEnd && reservation.endAt > weekStart,
            ),
        )
      : [];
  const activeReservations = reservations.filter((reservation) =>
    isActiveReservation(reservation, now),
  );
  const [lunchReservations, lunchDayStates] = await Promise.all([
    db.lunchReservation.findMany({
      where: {
        userId: user.id,
        status: LunchReservationStatus.ACTIVE,
      },
      select: {
        id: true,
        date: true,
        buildingId: true,
        breakfastReserved: true,
        lunchReserved: true,
      },
    }),
    Promise.all(weekDates.map((date) => getLunchDayState({ date, now }))),
  ]);
  const lunchReservationByDate = new Map(
    lunchReservations.map((reservation) => [
      formatJalaliDateParam(reservation.date),
      reservation,
    ]),
  );
  const activeLunchReservationByDate = Object.fromEntries(
    lunchReservations.map((reservation) => [
      formatJalaliDateParam(reservation.date),
      { id: reservation.id },
    ]),
  );
  const lunchAvailabilityByDate = Object.fromEntries(
    weekDates.map((date, index) => {
      const dateParamForLunch = formatJalaliDateParam(date);
      const dayState = lunchDayStates[index];
      const existingReservation =
        lunchReservationByDate.get(dateParamForLunch) ?? null;
      const unavailableReason = existingReservation
        ? null
        : buildings.length === 0
          ? "هنوز ساختمانی برای دریافت غذا تعریف نشده است."
          : dayState.isOpen
            ? null
            : dayState.isServiceDay
              ? `مهلت رزرو غذا گذشته است. مهلت تا ${formatJalaliDate(dayState.cutoffAt)}، ${formatPersianLocalTime(dayState.cutoffAt)} بود.`
              : "برای این تاریخ سرویس غذا فعال نیست.";

      return [
        dateParamForLunch,
        {
          cutoffLabel: `مهلت رزرو غذا تا ${formatJalaliDate(dayState.cutoffAt)}، ${formatPersianLocalTime(dayState.cutoffAt)}`,
          existingReservation: existingReservation
            ? {
                id: existingReservation.id,
                buildingId: existingReservation.buildingId,
                breakfastReserved: existingReservation.breakfastReserved,
                lunchReserved: existingReservation.lunchReserved,
              }
            : null,
          isOpen:
            dayState.isOpen && buildings.length > 0,
          unavailableReason,
        },
      ];
    }),
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
            shortLabel: formatCalendarColumnLabel(
              date,
              weekSpansMultipleJalaliMonths,
            ),
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
              const proposedReservations = getReservationDetailsForSlot(
                selectedPoolCalendarReservations,
                slot.slotStart,
                slot.slotEnd,
                ReservationStatus.ALTERNATIVE_PROPOSED,
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
                pendingCount: slot.pendingCount + proposedReservations.length,
                pendingReservations: [
                  ...getReservationDetailsForSlot(
                    selectedPoolCalendarReservations,
                    slot.slotStart,
                    slot.slotEnd,
                    ReservationStatus.PENDING,
                  ),
                  ...proposedReservations,
                ],
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
        shortLabel: formatCalendarColumnLabel(
          date,
          weekSpansMultipleJalaliMonths,
        ),
        slots: [],
      }));

  return (
    <div className="grid gap-6">
      <PageHeader
        subtitle="درخواست رزرو جدید و مشاهده ظرفیت سیستم‌ها"
        title="رزروها"
      />

      {toast ? <UrlToast {...toast} /> : null}

      <ReservationsInteractiveSection
        action={createReservationInlineAction}
        activeReservations={activeReservations}
        activeLunchReservationByDate={activeLunchReservationByDate}
        cancelLunchReservationAction={cancelLunchReservationAction}
        currentDateParam={dateParam}
        dailyActiveReservationCountByDate={dailyActiveReservationCountByDate}
        dailyReservedHoursByDate={dailyReservedHoursByDate}
        dailyUserHourLimit={dailyUserHourLimit}
        emptyMessage={
          selectedResourcePool
            ? "No working-hour slots are configured for this week."
            : "No active resource pool is configured."
        }
        lunchAvailabilityByDate={lunchAvailabilityByDate}
        buildings={buildings}
        lunchReservationAction={createLunchReservationAction}
        nextWeekDateParam={formatJalaliDateParam(addDays(weekStart, 7))}
        previousWeekDateParam={formatJalaliDateParam(addDays(weekStart, -7))}
        oneReservationPerDayEnabled={oneReservationPerDayEnabled}
        resourcePools={resourcePools}
        todayDateParam={formatJalaliDateParam(now)}
        weekDays={weekDays}
        weekLabel={formatWeekLabel(weekDates[0], weekDates[6])}
      />
    </div>
  );
}
