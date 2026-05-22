import { ReservationStatus } from "@prisma/client";
import { CalendarClock, Check, Download, X } from "lucide-react";

import {
  approveReservationAction,
  cancelReservationByManagerAction,
  proposeAlternativeAction,
  rejectReservationAction,
} from "@/app/manager/actions";
import { ManagerWeeklyCalendar } from "@/components/calendar/manager-weekly-calendar";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { getSlotUsage } from "@/lib/capacity-service";
import { db } from "@/lib/db";
import {
  JALALI_DATE_INPUT_PLACEHOLDER,
  formatJalaliDate,
  formatJalaliDateWithoutYear,
  formatJalaliDateParam,
  formatJalaliDateTime,
  formatLocalTime,
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
  resourcePoolId: string;
  startAt: Date;
  endAt: Date;
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

type QueueItem = {
  reservation: QueueReservation;
  slots: Array<{
    slotStart: Date;
    slotEnd: Date;
    approvedCount: number;
    pendingCount: number;
    capacity: number;
  }>;
};

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

function formatDateTime(date: Date): string {
  return formatJalaliDateTime(date);
}

function formatHour(date: Date): string {
  return formatLocalTime(date);
}

function formatDuration(startAt: Date, endAt: Date): string {
  const hours = Math.round((endAt.getTime() - startAt.getTime()) / 3_600_000);

  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function buildHourOptions() {
  return Array.from({ length: 24 }, (_, hour) => hour);
}

function buildExportHref(dateParam: string): string {
  return `/manager/export?date=${encodeURIComponent(dateParam)}`;
}

function buildReviewModalId(reservationId: string): string {
  return `review-reservation-${reservationId}`;
}

function buildManagerHref(dateParam: string): string {
  return `/manager?date=${encodeURIComponent(dateParam)}`;
}

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

function getQueueToast(params: Awaited<ManagerPageProps["searchParams"]>) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  const successMessage =
    (params?.approved && "Reservation approved.") ||
    (params?.cancelled && "Reservation cancelled.") ||
    (params?.rejected && "Reservation rejected.") ||
    (params?.alternative && "Alternative proposed.");

  return successMessage
    ? {
        consumeKeys: ["approved", "cancelled", "rejected", "alternative"],
        message: successMessage,
        variant: "success" as const,
      }
    : null;
}

function CapacitySummary({ item }: { item: QueueItem }) {
  return (
    <div className="grid gap-2">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        Slot capacity
      </p>
      <div className="grid gap-2">
        {item.slots.map((slot) => {
          const available = Math.max(slot.capacity - slot.approvedCount, 0);
          const isFull = available <= 0;

          return (
            <div
              className={`grid gap-2 rounded-md border px-3 py-2 text-sm sm:grid-cols-[110px_1fr] ${
                isFull ? "border-red-200 bg-red-50" : "bg-muted/30"
              }`}
              key={slot.slotStart.toISOString()}
            >
              <span className="font-medium">
                {formatHour(slot.slotStart)}-{formatHour(slot.slotEnd)}
              </span>
              <span className="text-muted-foreground">
                {slot.approvedCount} approved, {slot.pendingCount} pending,{" "}
                {available} of {slot.capacity} available
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QueueCard({
  fieldIdPrefix,
  item,
  dateParam,
}: {
  fieldIdPrefix: string;
  item: QueueItem;
  dateParam: string;
}) {
  const hourOptions = buildHourOptions();
  const requestedDate = formatJalaliDateParam(item.reservation.startAt);
  const defaultStartHour = item.reservation.startAt.getHours();
  const defaultEndHour = item.reservation.endAt.getHours();
  const proposedDateId = `${fieldIdPrefix}-proposedDate-${item.reservation.id}`;
  const proposedStartHourId = `${fieldIdPrefix}-proposedStartHour-${item.reservation.id}`;
  const proposedEndHourId = `${fieldIdPrefix}-proposedEndHour-${item.reservation.id}`;
  const isPending = item.reservation.status === ReservationStatus.PENDING;

  return (
    <article className="rounded-lg border bg-card p-5 text-card-foreground">
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-medium">{item.reservation.user.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.reservation.user.email}
              </p>
            </div>
            <span
              className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-medium ring-1 ${
                isPending
                  ? "bg-amber-50 text-amber-800 ring-amber-200"
                  : "bg-emerald-50 text-emerald-800 ring-emerald-200"
              }`}
            >
              {item.reservation.status}
            </span>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Pool</dt>
              <dd className="mt-1 font-medium">
                {item.reservation.resourcePool.name}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Duration</dt>
              <dd className="mt-1 font-medium">
                {formatDuration(item.reservation.startAt, item.reservation.endAt)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Start</dt>
              <dd className="mt-1 font-medium">
                {formatDateTime(item.reservation.startAt)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">End</dt>
              <dd className="mt-1 font-medium">
                {formatDateTime(item.reservation.endAt)}
              </dd>
            </div>
          </dl>

          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Reason
            </p>
            <p className="mt-2 rounded-md bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
              {item.reservation.reason || "No reason provided."}
            </p>
          </div>

          <CapacitySummary item={item} />
        </div>

        <div className="grid content-start gap-4">
          {isPending ? (
            <>
              <form action={approveReservationAction}>
                <input
                  name="reservationId"
                  type="hidden"
                  value={item.reservation.id}
                />
                <input name="date" type="hidden" value={dateParam} />
                <SubmitButton className="w-full" pendingLabel="Approving...">
                  <Check className="h-4 w-4" />
                  Approve
                </SubmitButton>
              </form>

              <form action={rejectReservationAction} className="grid gap-2">
                <input
                  name="reservationId"
                  type="hidden"
                  value={item.reservation.id}
                />
                <input name="date" type="hidden" value={dateParam} />
                <textarea
                  className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  maxLength={500}
                  name="rejectionReason"
                  placeholder="Optional rejection reason"
                />
                <SubmitButton
                  className="w-full"
                  pendingLabel="Rejecting..."
                  variant="outline"
                >
                  <X className="h-4 w-4" />
                  Reject
                </SubmitButton>
              </form>

              <form action={proposeAlternativeAction} className="grid gap-3">
                <input
                  name="reservationId"
                  type="hidden"
                  value={item.reservation.id}
                />
                <input name="date" type="hidden" value={dateParam} />
                <div className="grid gap-2">
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor={proposedDateId}
                  >
                    Alternative date
                  </label>
                  <input
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue={requestedDate}
                    dir="ltr"
                    id={proposedDateId}
                    name="proposedDate"
                    pattern="\d{4}[-/]\d{1,2}[-/]\d{1,2}"
                    placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
                    title={`Enter a Jalali date like ${JALALI_DATE_INPUT_PLACEHOLDER}`}
                    type="text"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-2">
                    <label
                      className="text-xs font-medium text-muted-foreground"
                      htmlFor={proposedStartHourId}
                    >
                      Start
                    </label>
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue={defaultStartHour}
                      id={proposedStartHourId}
                      name="proposedStartHour"
                    >
                      {hourOptions.slice(0, 23).map((hour) => (
                        <option key={hour} value={hour}>
                          {hour.toString().padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <label
                      className="text-xs font-medium text-muted-foreground"
                      htmlFor={proposedEndHourId}
                    >
                      End
                    </label>
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue={defaultEndHour}
                      id={proposedEndHourId}
                      name="proposedEndHour"
                    >
                      {hourOptions.slice(1).map((hour) => (
                        <option key={hour} value={hour}>
                          {hour.toString().padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <SubmitButton
                  className="w-full"
                  pendingLabel="Proposing..."
                  variant="secondary"
                >
                  <CalendarClock className="h-4 w-4" />
                  Propose alternative
                </SubmitButton>
              </form>
            </>
          ) : (
            <form action={cancelReservationByManagerAction}>
              <input
                name="reservationId"
                type="hidden"
                value={item.reservation.id}
              />
              <input name="date" type="hidden" value={dateParam} />
              <SubmitButton
                className="w-full"
                pendingLabel="Cancelling..."
                variant="outline"
              >
                <X className="h-4 w-4" />
                Cancel reservation
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
    </article>
  );
}

function ReviewModal({
  item,
  dateParam,
}: {
  item: QueueItem;
  dateParam: string;
}) {
  return (
    <div
      aria-labelledby={`${buildReviewModalId(item.reservation.id)}-title`}
      aria-modal="true"
      className="fixed inset-0 z-50 hidden items-start justify-center overflow-y-auto bg-black/55 p-4 target:flex"
      id={buildReviewModalId(item.reservation.id)}
      role="dialog"
    >
      <a
        aria-label="Close review dialog"
        className="fixed inset-0 cursor-default"
        href={buildManagerHref(dateParam)}
      />
      <div className="relative z-10 grid w-full max-w-5xl gap-3 py-8">
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3 shadow-lg">
          <h2
            className="text-sm font-medium"
            id={`${buildReviewModalId(item.reservation.id)}-title`}
          >
            {item.reservation.status === ReservationStatus.PENDING
              ? "Review pending reservation"
              : "Approved reservation details"}
          </h2>
          <a
            aria-label="Close review dialog"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            href={buildManagerHref(dateParam)}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>
        <QueueCard
          dateParam={dateParam}
          fieldIdPrefix="modal"
          item={item}
        />
      </div>
    </div>
  );
}

export default async function ManagerPage({ searchParams }: ManagerPageProps) {
  const params = await searchParams;
  const toast = getQueueToast(params);
  const selectedDate = parseJalaliDateParam(params?.date) ?? new Date();
  const dateParam = formatJalaliDateParam(selectedDate);
  const weekStart = getWeekStart(selectedDate);
  const weekDates = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  );
  const weekRangeEnd = addDays(weekStart, 7);
  const resourcePool = await db.resourcePool.findFirst({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
    },
  });
  const weekReservations =
    resourcePool
      ? await db.reservation.findMany({
          where: {
            resourcePoolId: resourcePool.id,
            startAt: { lt: weekRangeEnd },
            endAt: { gt: weekStart },
            status: {
              in: [ReservationStatus.APPROVED, ReservationStatus.PENDING],
            },
          },
          orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            resourcePoolId: true,
            startAt: true,
            endAt: true,
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
              ? workingWindow.reason ?? "Non-working day"
              : null,
            dateLabel: formatNaturalJalaliDate(date),
            dateParam: formatJalaliDateParam(date),
            shortLabel: formatCalendarColumnLabel(date),
            slots: slots.map((slot) => {
              const details = weekReservations
                .filter(
                  (reservation) =>
                    reservation.startAt < slot.slotEnd &&
                    reservation.endAt > slot.slotStart,
                )
                .map((reservation) => ({
                  id: reservation.id,
                  userName: reservation.user.name,
                  status:
                    reservation.status === ReservationStatus.APPROVED
                      ? ("APPROVED" as const)
                      : ("PENDING" as const),
                  reason: reservation.reason,
                  href: `#${buildReviewModalId(reservation.id)}`,
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
        dateLabel: formatNaturalJalaliDate(date),
        dateParam: formatJalaliDateParam(date),
        shortLabel: formatCalendarColumnLabel(date),
        slots: [],
      }));
  const pendingReservations: QueueReservation[] = await db.reservation.findMany({
    where: {
      status: ReservationStatus.PENDING,
    },
    orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      resourcePoolId: true,
      startAt: true,
      endAt: true,
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
  const queueItems: QueueItem[] = await Promise.all(
    pendingReservations.map(async (reservation) => ({
      reservation,
      slots: await getSlotUsage({
        resourcePoolId: reservation.resourcePoolId,
        startAt: reservation.startAt,
        endAt: reservation.endAt,
      }),
    })),
  );
  const approvedCalendarItems: QueueItem[] = await Promise.all(
    weekReservations
      .filter((reservation) => reservation.status === ReservationStatus.APPROVED)
      .map(async (reservation) => ({
        reservation,
        slots: await getSlotUsage({
          resourcePoolId: reservation.resourcePoolId,
          startAt: reservation.startAt,
          endAt: reservation.endAt,
        }),
      })),
  );
  const modalItems = [...queueItems, ...approvedCalendarItems];

  return (
    <div className="grid gap-6">
      {toast ? <UrlToast {...toast} /> : null}

      <section className="grid gap-3">
        <div className="flex justify-end">
          <a
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            href={buildExportHref(dateParam)}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </a>
        </div>

        <ManagerWeeklyCalendar
          currentDateParam={dateParam}
          emptyMessage={
            resourcePool
              ? "No working-hour slots are configured for this week."
              : "No active resource pool is configured."
          }
          nextWeekDateParam={formatJalaliDateParam(addDays(weekStart, 7))}
          previousWeekDateParam={formatJalaliDateParam(addDays(weekStart, -7))}
          title={
            resourcePool
              ? `${resourcePool.name} weekly approval calendar`
              : "Manager weekly approval calendar"
          }
          weekDays={weekDays}
          weekLabel={formatWeekLabel(weekDates[0], weekDates[6])}
        />
        {modalItems.map((item) => (
          <ReviewModal
            dateParam={dateParam}
            item={item}
            key={`review-modal-${item.reservation.id}`}
          />
        ))}
      </section>

      {queueItems.length === 0 ? (
        <section className="rounded-lg border bg-card p-5 text-card-foreground">
          <h2 className="font-medium">Approval queue</h2>
          <p className="mt-5 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
            No pending reservation requests.
          </p>
        </section>
      ) : null}
    </div>
  );
}
