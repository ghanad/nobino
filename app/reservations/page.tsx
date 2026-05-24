import { AlternativeStatus, ReservationStatus } from "@prisma/client";
import { ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import Link from "next/link";

import {
  acceptAlternativeAction,
  cancelReservationByUserAction,
  createReservationAction,
  rejectAlternativeAction,
} from "@/app/reservations/actions";
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
};

const DISPLAY_TIME_FORMATTER = new Intl.DateTimeFormat("fa-IR", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
});

const MY_RESERVATIONS_PAGE_SIZE = 6;

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

  return "bg-muted text-muted-foreground ring-border";
}

function getStatusLabel(status: ReservationStatus): string {
  return status.replaceAll("_", " ");
}

function createEmptyReservationGroups(): Record<ReservationStatus, MyReservation[]> {
  return {
    [ReservationStatus.PENDING]: [],
    [ReservationStatus.ALTERNATIVE_PROPOSED]: [],
    [ReservationStatus.APPROVED]: [],
    [ReservationStatus.REJECTED]: [],
    [ReservationStatus.CANCELLED_BY_USER]: [],
    [ReservationStatus.CANCELLED_BY_ADMIN]: [],
  };
}

function getReservationPage(value: string | undefined): number {
  const parsedPage = Number(value);

  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    return 1;
  }

  return parsedPage;
}

function getReservationsPageHref(
  params: Awaited<ReservationsPageProps["searchParams"]>,
  page: number,
): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  if (page <= 1) {
    searchParams.delete("reservationPage");
  } else {
    searchParams.set("reservationPage", String(page));
  }

  const query = searchParams.toString();

  return query ? `/reservations?${query}` : "/reservations";
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
  if (reservation.alternatives.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        Alternative proposals
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
                    {alternative.status}
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
                    <SubmitButton pendingLabel="Accepting..." size="sm">
                      <Check className="h-4 w-4" />
                      Accept
                    </SubmitButton>
                  </form>
                  <form action={rejectAlternativeAction}>
                    <input
                      name="alternativeId"
                      type="hidden"
                      value={alternative.id}
                    />
                    <SubmitButton
                      pendingLabel="Rejecting..."
                      size="sm"
                      variant="outline"
                    >
                      <X className="h-4 w-4" />
                      Reject
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
  const canCancel = reservation.status === ReservationStatus.PENDING;

  return (
    <article className="rounded-md border bg-card p-3 text-card-foreground">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-medium">{reservation.resourcePool.name}</h3>
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

      <div className="mt-3 grid gap-3">
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Reason</dt>
            <dd className="mt-1 leading-5">
              {reservation.reason || "No reason provided."}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Rejection reason</dt>
            <dd className="mt-1 leading-5">
              {reservation.rejectionReason || "-"}
            </dd>
          </div>
        </dl>

        <AlternativeList reservation={reservation} />

        {canCancel ? (
          <form action={cancelReservationByUserAction}>
            <input name="reservationId" type="hidden" value={reservation.id} />
            <SubmitButton pendingLabel="Cancelling..." size="sm" variant="outline">
              <X className="h-4 w-4" />
              Cancel pending request
            </SubmitButton>
          </form>
        ) : null}
      </div>
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
  const totalReservationPages = Math.max(
    1,
    Math.ceil(reservations.length / MY_RESERVATIONS_PAGE_SIZE),
  );
  const currentReservationPage = Math.min(
    getReservationPage(params?.reservationPage),
    totalReservationPages,
  );
  const paginatedReservations = reservations.slice(
    (currentReservationPage - 1) * MY_RESERVATIONS_PAGE_SIZE,
    currentReservationPage * MY_RESERVATIONS_PAGE_SIZE,
  );
  const reservationsByStatus = paginatedReservations.reduce<
    Record<ReservationStatus, MyReservation[]>
  >(
    (groups, reservation) => {
      groups[reservation.status].push(reservation);

      return groups;
    },
    createEmptyReservationGroups(),
  );
  const firstReservationNumber =
    reservations.length === 0
      ? 0
      : (currentReservationPage - 1) * MY_RESERVATIONS_PAGE_SIZE + 1;
  const lastReservationNumber = Math.min(
    currentReservationPage * MY_RESERVATIONS_PAGE_SIZE,
    reservations.length,
  );
  const statusSections = [
    ReservationStatus.PENDING,
    ReservationStatus.ALTERNATIVE_PROPOSED,
    ReservationStatus.APPROVED,
    ReservationStatus.REJECTED,
    ReservationStatus.CANCELLED_BY_USER,
    ReservationStatus.CANCELLED_BY_ADMIN,
  ];
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
  const now = new Date();
  const weekStart = getWeekStart(selectedDate);
  const weekDates = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
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
              ? workingWindow.reason ?? "Non-working day"
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

      <section className="rounded-lg border bg-card p-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium">My reservations</h2>
          <p className="text-sm text-muted-foreground">
            Track your requests, rejection reasons, and manager-proposed
            alternatives.
          </p>
        </div>

        {reservations.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">
            No reservation requests yet.
          </p>
        ) : (
          <div className="mt-5 grid gap-4">
            <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing {firstReservationNumber}-{lastReservationNumber} of{" "}
                {reservations.length}
              </p>
              {totalReservationPages > 1 ? (
                <div className="flex items-center gap-2">
                  {currentReservationPage > 1 ? (
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={getReservationsPageHref(
                          params,
                          currentReservationPage - 1,
                        )}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Link>
                    </Button>
                  ) : (
                    <Button disabled size="sm" variant="outline">
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                  )}
                  <span>
                    Page {currentReservationPage} of {totalReservationPages}
                  </span>
                  {currentReservationPage < totalReservationPages ? (
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={getReservationsPageHref(
                          params,
                          currentReservationPage + 1,
                        )}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  ) : (
                    <Button disabled size="sm" variant="outline">
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
            {statusSections
              .filter((status) => reservationsByStatus[status].length > 0)
              .map((status) => (
                <section className="grid gap-2" key={status}>
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {getStatusLabel(status)}
                  </h3>
                  <div className="grid gap-3">
                    {reservationsByStatus[status].map((reservation) => (
                      <ReservationCard
                        key={reservation.id}
                        reservation={reservation}
                      />
                    ))}
                  </div>
                </section>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
