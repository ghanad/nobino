import { ReservationStatus } from "@prisma/client";

import { DailyCapacityCalendar } from "@/components/calendar/daily-capacity-calendar";
import { getSlotUsage } from "@/lib/capacity-service";
import { db } from "@/lib/db";
import { getWorkingWindowForDate } from "@/lib/schedule";

type ManagerPageProps = {
  searchParams?: Promise<{
    date?: string;
  }>;
};

function formatDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isValidDateParam(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function buildLocalDate(dateParam: string): Date {
  const [year, month, day] = dateParam.split("-").map(Number);

  return new Date(year, month - 1, day, 0, 0, 0, 0);
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

export default async function ManagerPage({ searchParams }: ManagerPageProps) {
  const params = await searchParams;
  const dateParam = isValidDateParam(params?.date)
    ? params.date
    : formatDateParam(new Date());
  const selectedDate = buildLocalDate(dateParam);
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
      <DailyCapacityCalendar
        date={selectedDate}
        dateParam={dateParam}
        detailsBySlotStart={detailsBySlotStart}
        emptyMessage={
          resourcePool
            ? "No working-hour slots are configured for this date."
            : "No active resource pool is configured."
        }
        nextDateParam={formatDateParam(addDays(selectedDate, 1))}
        previousDateParam={formatDateParam(addDays(selectedDate, -1))}
        slots={slots}
        title={
          resourcePool
            ? `${resourcePool.name} manager availability`
            : "Manager availability"
        }
      />

      <section className="rounded-lg border bg-card p-5 text-card-foreground">
        <h2 className="font-medium">Approval queue</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Managers and admins can access this area. Approval actions are planned
          for a later phase.
        </p>
      </section>
    </div>
  );
}
