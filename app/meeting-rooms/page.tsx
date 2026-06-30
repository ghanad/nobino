import { ReservationStatus } from "@prisma/client";

import {
  cancelMeetingRoomReservationAction,
  createMeetingRoomReservationInlineAction,
} from "@/app/meeting-rooms/actions";
import { PageHeader } from "@/components/app/page-header";
import { MeetingRoomCalendar } from "@/components/meeting-rooms/meeting-room-calendar";
import { MeetingRoomSelector } from "@/components/meeting-rooms/meeting-room-selector";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatJalaliDate,
  formatJalaliDateParam,
  formatPersianLocalTime,
  getJalaliDisplayParts,
  parseJalaliDateParam,
} from "@/lib/jalali-date";
import { getMeetingRoomSlotUsage } from "@/lib/meeting-room-capacity-service";
import { getMeetingRoomWorkingWindowForDate } from "@/lib/meeting-room-schedule";
import { cn } from "@/lib/utils";

type MeetingRoomsPageProps = {
  searchParams?: Promise<{
    cancelled?: string;
    created?: string;
    date?: string;
    error?: string;
    roomId?: string;
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

function getToast(params: Awaited<MeetingRoomsPageProps["searchParams"]>) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  const successMessage =
    (params?.created && "درخواست رزرو اتاق جلسه ثبت شد.") ||
    (params?.cancelled && "رزرو اتاق جلسه لغو شد.");

  return successMessage
    ? {
        consumeKeys: ["created", "cancelled"],
        message: successMessage,
        variant: "success" as const,
      }
    : null;
}

function formatWeekLabel(startDate: Date, endDate: Date): string {
  const start = getJalaliDisplayParts(startDate);
  const end = getJalaliDisplayParts(endDate);

  if (start.year === end.year && start.month === end.month) {
    return `${start.dayLabel} تا ${end.dayLabel} ${end.monthLabel} ${end.yearLabel}`;
  }

  return `${start.dayLabel} ${start.monthLabel} تا ${end.dayLabel} ${end.monthLabel} ${end.yearLabel}`;
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
  ]
    .filter(Boolean)
    .join(" ");
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

function getReservationDetailsForSlot(
  reservations: Array<{
    id: string;
    startAt: Date;
    endAt: Date;
    status: ReservationStatus;
    userId: string;
    user: {
      email: string | null;
      name: string | null;
    };
  }>,
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
      email: reservation.user.email,
      id: reservation.id,
      partySize: 1,
      userId: reservation.userId,
      userName: reservation.user.name,
    }));
}

function getMyReservationForSlot(
  reservations: Array<{
    id: string;
    startAt: Date;
    endAt: Date;
    status: ReservationStatus;
  }>,
  slotStart: Date,
  slotEnd: Date,
): {
  id: string;
  status: "APPROVED" | "PENDING";
} | null {
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

export default async function MeetingRoomsPage({
  searchParams,
}: MeetingRoomsPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const toast = getToast(params);
  const selectedDate = parseJalaliDateParam(params?.date) ?? new Date();
  const dateParam = formatJalaliDateParam(selectedDate);
  const weekStart = getWeekStart(selectedDate);
  const weekDates = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  );
  const weekSpansMultipleJalaliMonths = !isSameJalaliMonth(weekDates);
  const weekEnd = addDays(weekStart, 7);
  const rooms = await db.meetingRoom.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      description: true,
      id: true,
      location: true,
      name: true,
    },
  });
  const selectedRoom =
    rooms.find((room) => room.id === params?.roomId) ?? rooms[0] ?? null;
  const reservations = selectedRoom
    ? await db.meetingRoomReservation.findMany({
        where: {
          roomId: selectedRoom.id,
          startAt: { lt: weekEnd },
          endAt: { gt: weekStart },
          status: {
            in: [ReservationStatus.PENDING, ReservationStatus.APPROVED],
          },
        },
        orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
        select: {
          endAt: true,
              id: true,
              roomId: true,
              startAt: true,
              status: true,
              title: true,
              userId: true,
              user: {
                select: {
                  email: true,
                  name: true,
                },
              },
        },
      })
    : [];
  const windows = selectedRoom
    ? await Promise.all(
        weekDates.map((date) =>
          getMeetingRoomWorkingWindowForDate({
            roomId: selectedRoom.id,
            date,
          }),
        ),
      )
    : [];
  const previousDateParam = formatJalaliDateParam(addDays(weekStart, -7));
  const nextDateParam = formatJalaliDateParam(addDays(weekStart, 7));
  const todayParam = formatJalaliDateParam(new Date());
  const now = new Date();
  const myReservations = reservations.filter(
    (reservation) => reservation.userId === user.id,
  );
  const weekDays = selectedRoom
    ? await Promise.all(
        weekDates.map(async (date, index) => {
          const workingWindow = windows[index];
          const slots =
            workingWindow?.isWorkingDay &&
            workingWindow.startTime &&
            workingWindow.endTime
              ? await getMeetingRoomSlotUsage({
                  roomId: selectedRoom.id,
                  startAt: buildDateAtTime(date, workingWindow.startTime),
                  endAt: buildDateAtTime(date, workingWindow.endTime),
                })
              : [];

          return {
            closedReason: !workingWindow?.isWorkingDay
              ? workingWindow?.reason ?? "روز غیرکاری"
              : null,
            dateLabel: formatJalaliDate(date),
            modalDateLabel: formatJalaliDate(date),
            dateParam: formatJalaliDateParam(date),
            shortLabel: formatCalendarColumnLabel(
              date,
              weekSpansMultipleJalaliMonths,
            ),
            slots: slots.map((slot) => {
              const isPast = slot.slotStart.getTime() < now.getTime();
              const isFull = slot.approvedCount >= slot.capacity;
              const unavailableReason: "full" | "past" | null = isPast
                ? "past"
                : isFull
                  ? "full"
                  : null;
              const myReservation = getMyReservationForSlot(
                myReservations,
                slot.slotStart,
                slot.slotEnd,
              );

              return {
                slotStartHour: slot.slotStart.getHours(),
                slotEndHour: slot.slotEnd.getHours(),
                approvedCount: slot.approvedCount,
                approvedReservations: getReservationDetailsForSlot(
                  reservations,
                  slot.slotStart,
                  slot.slotEnd,
                  ReservationStatus.APPROVED,
                ),
                pendingCount: slot.pendingCount,
                pendingReservations: getReservationDetailsForSlot(
                  reservations,
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
    : [];

  return (
    <div className="grid gap-6">
      <PageHeader
        subtitle="انتخاب اتاق، مشاهده درخواست‌های در انتظار و رزروهای تاییدشده"
        title="رزرو اتاق جلسه"
      />

      {toast ? <UrlToast {...toast} /> : null}

      {rooms.length === 0 ? (
        <section className="rounded-lg border bg-card p-5 text-card-foreground">
          اتاق جلسه فعالی تعریف نشده است.
        </section>
      ) : (
        <>
          <section className="grid gap-3 rounded-lg border bg-card p-4">
            <MeetingRoomSelector
              dateParam={dateParam}
              rooms={rooms}
              selectedRoomId={selectedRoom?.id ?? ""}
            />
            {selectedRoom?.description ? (
              <p className="text-sm text-muted-foreground">
                {selectedRoom.description}
              </p>
            ) : null}
          </section>

          {selectedRoom ? (
            <MeetingRoomCalendar
              action={createMeetingRoomReservationInlineAction}
              emptyMessage="برای این هفته بازه زمانی قابل رزرو وجود ندارد."
              nextWeekDateParam={nextDateParam}
              previousWeekDateParam={previousDateParam}
              roomId={selectedRoom.id}
              roomName={selectedRoom.name}
              todayDateParam={todayParam}
              weekDays={weekDays}
              weekLabel={formatWeekLabel(weekStart, addDays(weekStart, 6))}
            />
          ) : null}

          <section className="rounded-lg border bg-card p-5 text-right" dir="rtl">
            <h2 className="mb-4 text-base font-semibold">درخواست‌های من</h2>
            <div className="grid gap-2">
              {reservations.filter((reservation) => reservation.userId === user.id)
                .length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  درخواست فعالی برای این هفته ندارید.
                </p>
              ) : (
                reservations
                  .filter((reservation) => reservation.userId === user.id)
                  .map((reservation) => (
                    <div
                      className={cn(
                        "rounded-md border p-3 text-sm leading-6",
                        reservation.status === ReservationStatus.APPROVED
                          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                          : "border-amber-200 bg-amber-50 text-amber-950",
                      )}
                      key={reservation.id}
                    >
                      <div className="font-semibold">
                        {formatJalaliDate(reservation.startAt)}،{" "}
                        {formatPersianLocalTime(reservation.startAt)} تا{" "}
                        {formatPersianLocalTime(reservation.endAt)}
                      </div>
                      {reservation.title ? <div>{reservation.title}</div> : null}
                      <div>
                        {reservation.status === ReservationStatus.APPROVED
                          ? "تاییدشده"
                          : "در انتظار تایید"}
                      </div>
                      <form
                        action={cancelMeetingRoomReservationAction}
                        className="mt-2"
                      >
                        <input
                          name="reservationId"
                          type="hidden"
                          value={reservation.id}
                        />
                        <input
                          name="roomId"
                          type="hidden"
                          value={reservation.roomId}
                        />
                        <input name="date" type="hidden" value={dateParam} />
                        <SubmitButton
                          className="h-8 px-3 text-xs"
                          pendingLabel="در حال لغو"
                          variant="outline"
                        >
                          لغو
                        </SubmitButton>
                      </form>
                    </div>
                  ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
