import { ReservationStatus } from "@prisma/client";

import { createReservationAction } from "@/app/reservations/actions";
import { DailyCapacityCalendar } from "@/components/calendar/daily-capacity-calendar";
import { CreateReservationForm } from "@/components/reservation/create-reservation-form";
import { getSlotUsage } from "@/lib/capacity-service";
import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getWorkingWindowForDate } from "@/lib/schedule";

type ReservationsPageProps = {
  searchParams?: Promise<{
    created?: string;
    date?: string;
    error?: string;
  }>;
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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

export default async function ReservationsPage({
  searchParams,
}: ReservationsPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const dateParam = isValidDateParam(params?.date)
    ? params.date
    : formatDateParam(new Date());
  const selectedDate = buildLocalDate(dateParam);
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
      take: 10,
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        reason: true,
        resourcePool: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);
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
      {params?.created ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Reservation request created and sent for manager approval.
        </div>
      ) : null}

      {params?.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {params.error}
        </div>
      ) : null}

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
        nextDateParam={formatDateParam(addDays(selectedDate, 1))}
        previousDateParam={formatDateParam(addDays(selectedDate, -1))}
        slots={calendarSlots}
        title={
          selectedResourcePool
            ? `${selectedResourcePool.name} availability`
            : "Daily availability"
        }
      />

      <section className="rounded-lg border bg-card p-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium">My recent requests</h2>
          <p className="text-sm text-muted-foreground">
            Pending requests are visible here but do not consume capacity.
          </p>
        </div>

        {reservations.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">
            No reservation requests yet.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th className="pb-3 font-medium">Pool</th>
                  <th className="pb-3 font-medium">Start</th>
                  <th className="pb-3 font-medium">End</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reservations.map((reservation) => (
                  <tr key={reservation.id}>
                    <td className="py-3">{reservation.resourcePool.name}</td>
                    <td className="py-3">{formatDateTime(reservation.startAt)}</td>
                    <td className="py-3">{formatDateTime(reservation.endAt)}</td>
                    <td className="py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClass(
                          reservation.status,
                        )}`}
                      >
                        {reservation.status}
                      </span>
                    </td>
                    <td className="max-w-72 truncate py-3 text-muted-foreground">
                      {reservation.reason || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
