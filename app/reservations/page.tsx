import { AlternativeStatus, ReservationStatus } from "@prisma/client";
import { Check, X } from "lucide-react";

import {
  acceptAlternativeAction,
  cancelReservationByUserAction,
  createReservationAction,
  rejectAlternativeAction,
} from "@/app/reservations/actions";
import { DailyCapacityCalendar } from "@/components/calendar/daily-capacity-calendar";
import { CreateReservationForm } from "@/components/reservation/create-reservation-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireCurrentUser } from "@/lib/auth";
import { getSlotUsage } from "@/lib/capacity-service";
import { db } from "@/lib/db";
import {
  formatJalaliDateParam,
  formatJalaliDateTime,
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
  }>;
};

type MyReservation = {
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
    respondedAt: Date | null;
    createdAt: Date;
  }>;
};

function formatDateTime(date: Date): string {
  return formatJalaliDateTime(date);
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

function getAlternativeStatusClass(status: AlternativeStatus): string {
  if (status === AlternativeStatus.PROPOSED) {
    return "bg-sky-50 text-sky-800 ring-sky-200";
  }

  if (status === AlternativeStatus.ACCEPTED) {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }

  return "bg-muted text-muted-foreground ring-border";
}

function ReservationsFlash({
  params,
}: {
  params: Awaited<ReservationsPageProps["searchParams"]>;
}) {
  if (params?.error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {params.error}
      </div>
    );
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

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      {successMessage}
    </div>
  );
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
    <div className="grid gap-2">
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
              className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-[1fr_auto]"
              key={alternative.id}
            >
              <div className="grid gap-1 text-sm">
                <div className="font-medium">
                  {formatDateTime(alternative.proposedStartAt)} to{" "}
                  {formatDateTime(alternative.proposedEndAt)}
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
    <article className="rounded-lg border bg-card p-5 text-card-foreground">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-medium">{reservation.resourcePool.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDateTime(reservation.startAt)} to{" "}
            {formatDateTime(reservation.endAt)}
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

      <div className="mt-4 grid gap-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Reason</dt>
            <dd className="mt-1 leading-6">
              {reservation.reason || "No reason provided."}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Rejection reason</dt>
            <dd className="mt-1 leading-6">
              {reservation.rejectionReason || "-"}
            </dd>
          </div>
        </dl>

        <AlternativeList reservation={reservation} />

        {canCancel ? (
          <form action={cancelReservationByUserAction}>
            <input name="reservationId" type="hidden" value={reservation.id} />
            <SubmitButton pendingLabel="Cancelling..." variant="outline">
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

export default async function ReservationsPage({
  searchParams,
}: ReservationsPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const selectedDate = parseJalaliDateParam(params?.date) ?? new Date();
  const dateParam = formatJalaliDateParam(selectedDate);
  const [resourcePools, reservations] = await Promise.all([
    db.resourcePool.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        capacity: true,
      },
    }),
    db.reservation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
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
            respondedAt: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);
  const emptyReservationGroups: Record<ReservationStatus, MyReservation[]> = {
    [ReservationStatus.PENDING]: [],
    [ReservationStatus.ALTERNATIVE_PROPOSED]: [],
    [ReservationStatus.APPROVED]: [],
    [ReservationStatus.REJECTED]: [],
    [ReservationStatus.CANCELLED_BY_USER]: [],
    [ReservationStatus.CANCELLED_BY_ADMIN]: [],
  };
  const reservationsByStatus = reservations.reduce<
    Record<ReservationStatus, MyReservation[]>
  >(
    (groups, reservation) => {
      groups[reservation.status].push(reservation);

      return groups;
    },
    emptyReservationGroups,
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
  const workingWindow = await getWorkingWindowForDate(selectedDate);
  const calendarSlots =
    selectedResourcePool &&
    workingWindow.isWorkingDay &&
    workingWindow.startTime &&
    workingWindow.endTime
      ? await getSlotUsage({
          resourcePoolId: selectedResourcePool.id,
          startAt: buildDateAtTime(selectedDate, workingWindow.startTime),
          endAt: buildDateAtTime(selectedDate, workingWindow.endTime),
        })
      : [];

  return (
    <div className="grid gap-6">
      <ReservationsFlash params={params} />

      <CreateReservationForm
        action={createReservationAction}
        resourcePools={resourcePools}
      />

      <DailyCapacityCalendar
        date={selectedDate}
        dateParam={dateParam}
        emptyMessage={
          selectedResourcePool
            ? "No working-hour slots are configured for this date."
            : "No active resource pool is configured."
        }
        nextDateParam={formatJalaliDateParam(addDays(selectedDate, 1))}
        previousDateParam={formatJalaliDateParam(addDays(selectedDate, -1))}
        slots={calendarSlots}
        title={
          selectedResourcePool
            ? `${selectedResourcePool.name} availability`
            : "Daily availability"
        }
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
          <div className="mt-5 grid gap-6">
            {statusSections
              .filter((status) => reservationsByStatus[status].length > 0)
              .map((status) => (
                <section className="grid gap-3" key={status}>
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
