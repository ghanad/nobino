import { ReservationStatus } from "@prisma/client";
import { CalendarClock, Check, Download, X } from "lucide-react";

import {
  approveReservationAction,
  proposeAlternativeAction,
  rejectReservationAction,
} from "@/app/manager/actions";
import { DailyCapacityCalendar } from "@/components/calendar/daily-capacity-calendar";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { getSlotUsage } from "@/lib/capacity-service";
import { db } from "@/lib/db";
import {
  JALALI_DATE_INPUT_PLACEHOLDER,
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
    (params?.rejected && "Reservation rejected.") ||
    (params?.alternative && "Alternative proposed.");

  return successMessage
    ? {
        consumeKeys: ["approved", "rejected", "alternative"],
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
  item,
  dateParam,
}: {
  item: QueueItem;
  dateParam: string;
}) {
  const hourOptions = buildHourOptions();
  const requestedDate = formatJalaliDateParam(item.reservation.startAt);
  const defaultStartHour = item.reservation.startAt.getHours();
  const defaultEndHour = item.reservation.endAt.getHours();

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
            <span className="inline-flex w-fit rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
              PENDING
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
          <form action={approveReservationAction}>
            <input name="reservationId" type="hidden" value={item.reservation.id} />
            <input name="date" type="hidden" value={dateParam} />
            <SubmitButton className="w-full" pendingLabel="Approving...">
              <Check className="h-4 w-4" />
              Approve
            </SubmitButton>
          </form>

          <form action={rejectReservationAction} className="grid gap-2">
            <input name="reservationId" type="hidden" value={item.reservation.id} />
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
            <input name="reservationId" type="hidden" value={item.reservation.id} />
            <input name="date" type="hidden" value={dateParam} />
            <div className="grid gap-2">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`proposedDate-${item.reservation.id}`}
              >
                Alternative date
              </label>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={requestedDate}
                dir="ltr"
                id={`proposedDate-${item.reservation.id}`}
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
                  htmlFor={`proposedStartHour-${item.reservation.id}`}
                >
                  Start
                </label>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={defaultStartHour}
                  id={`proposedStartHour-${item.reservation.id}`}
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
                  htmlFor={`proposedEndHour-${item.reservation.id}`}
                >
                  End
                </label>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={defaultEndHour}
                  id={`proposedEndHour-${item.reservation.id}`}
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
        </div>
      </div>
    </article>
  );
}

export default async function ManagerPage({ searchParams }: ManagerPageProps) {
  const params = await searchParams;
  const toast = getQueueToast(params);
  const selectedDate = parseJalaliDateParam(params?.date) ?? new Date();
  const dateParam = formatJalaliDateParam(selectedDate);
  const resourcePool = await db.resourcePool.findFirst({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
    },
  });
  const workingWindow = await getWorkingWindowForDate(selectedDate);
  const range =
    resourcePool &&
    workingWindow.isWorkingDay &&
    workingWindow.startTime &&
    workingWindow.endTime
      ? {
          startAt: buildDateAtTime(selectedDate, workingWindow.startTime),
          endAt: buildDateAtTime(selectedDate, workingWindow.endTime),
        }
      : null;
  const slots =
    resourcePool && range
      ? await getSlotUsage({
          resourcePoolId: resourcePool.id,
          startAt: range.startAt,
          endAt: range.endAt,
        })
      : [];
  const reservations =
    resourcePool && range
      ? await db.reservation.findMany({
          where: {
            resourcePoolId: resourcePool.id,
            startAt: { lt: range.endAt },
            endAt: { gt: range.startAt },
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
            reason: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        })
      : [];
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
  const detailsBySlotStart = new Map<
    string,
    Array<{
      id: string;
      userName: string;
      status: "APPROVED" | "PENDING";
      reason: string | null;
    }>
  >();

  for (const slot of slots) {
    const details = reservations
      .filter(
        (reservation) =>
          reservation.startAt < slot.slotEnd && reservation.endAt > slot.slotStart,
      )
      .map((reservation) => ({
        id: reservation.id,
        userName: reservation.user.name,
        status:
          reservation.status === ReservationStatus.APPROVED
            ? ReservationStatus.APPROVED
            : ReservationStatus.PENDING,
        reason: reservation.reason,
      }));

    if (details.length > 0) {
      detailsBySlotStart.set(slot.slotStart.toISOString(), details);
    }
  }

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

        <DailyCapacityCalendar
          date={selectedDate}
          dateParam={dateParam}
          detailsBySlotStart={detailsBySlotStart}
          emptyMessage={
            resourcePool
              ? "No working-hour slots are configured for this date."
              : "No active resource pool is configured."
          }
          nextDateParam={formatJalaliDateParam(addDays(selectedDate, 1))}
          previousDateParam={formatJalaliDateParam(addDays(selectedDate, -1))}
          slots={slots}
          title={
            resourcePool
              ? `${resourcePool.name} manager availability`
              : "Manager availability"
          }
        />
      </section>

      <section className="rounded-lg border bg-card p-5 text-card-foreground">
        <h2 className="font-medium">Approval queue</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Pending requests do not consume capacity. Approval checks confirmed
          capacity again before updating the request.
        </p>

        {queueItems.length === 0 ? (
          <p className="mt-5 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
            No pending reservation requests.
          </p>
        ) : (
          <div className="mt-5 grid gap-4">
            {queueItems.map((item) => (
              <QueueCard
                dateParam={dateParam}
                item={item}
                key={item.reservation.id}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
