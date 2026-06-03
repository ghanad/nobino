"use client";

import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import Link from "next/link";

import {
  ActiveReservationsList,
  type ActiveReservation,
} from "@/app/reservations/active-reservations-list";
import {
  CreateReservationForm,
  type CreateReservationFormProps,
  type WeekDay,
} from "@/components/reservation/create-reservation-form";
import { Button } from "@/components/ui/button";
import { formatJalaliDateParam } from "@/lib/jalali-date";

type ReservationsInteractiveSectionProps = CreateReservationFormProps & {
  activeReservations: ActiveReservation[];
};

function getReservationDurationHours(reservation: ActiveReservation): number {
  return (
    (reservation.endAt.getTime() - reservation.startAt.getTime()) /
    (60 * 60 * 1000)
  );
}

function decrementDateValue(
  valuesByDate: Record<string, number>,
  dateParam: string,
  amount: number,
) {
  return {
    ...valuesByDate,
    [dateParam]: Math.max((valuesByDate[dateParam] ?? 0) - amount, 0),
  };
}

function removePendingReservationFromWeekDays(
  weekDays: WeekDay[],
  reservationId: string,
): WeekDay[] {
  return weekDays.map((day) => ({
    ...day,
    slots: day.slots.map((slot) => {
      const pendingReservations = slot.pendingReservations.filter(
        (reservation) => reservation.id !== reservationId,
      );
      const removedCount =
        slot.pendingReservations.length - pendingReservations.length;

      if (
        removedCount === 0 &&
        slot.myReservationId !== reservationId
      ) {
        return slot;
      }

      return {
        ...slot,
        myReservationId:
          slot.myReservationId === reservationId ? null : slot.myReservationId,
        myReservationStatus:
          slot.myReservationId === reservationId
            ? null
            : slot.myReservationStatus,
        pendingCount: Math.max(slot.pendingCount - removedCount, 0),
        pendingReservations,
      };
    }),
  }));
}

export function ReservationsInteractiveSection({
  activeReservations,
  dailyActiveReservationCountByDate,
  dailyReservedHoursByDate,
  weekDays,
  ...formProps
}: ReservationsInteractiveSectionProps) {
  const [currentWeekDays, setCurrentWeekDays] = useState(weekDays);
  const [
    currentDailyActiveReservationCountByDate,
    setCurrentDailyActiveReservationCountByDate,
  ] = useState(dailyActiveReservationCountByDate);
  const [currentDailyReservedHoursByDate, setCurrentDailyReservedHoursByDate] =
    useState(dailyReservedHoursByDate);

  useEffect(() => {
    setCurrentWeekDays(weekDays);
  }, [weekDays]);

  useEffect(() => {
    setCurrentDailyActiveReservationCountByDate(
      dailyActiveReservationCountByDate,
    );
  }, [dailyActiveReservationCountByDate]);

  useEffect(() => {
    setCurrentDailyReservedHoursByDate(dailyReservedHoursByDate);
  }, [dailyReservedHoursByDate]);

  const handleReservationCancelled = useCallback(
    (reservation: ActiveReservation) => {
      const dateParam = formatJalaliDateParam(reservation.startAt);

      setCurrentWeekDays((previousWeekDays) =>
        removePendingReservationFromWeekDays(previousWeekDays, reservation.id),
      );
      setCurrentDailyActiveReservationCountByDate((previousCounts) =>
        decrementDateValue(previousCounts, dateParam, 1),
      );
      setCurrentDailyReservedHoursByDate((previousHours) =>
        decrementDateValue(
          previousHours,
          dateParam,
          getReservationDurationHours(reservation),
        ),
      );
    },
    [],
  );

  return (
    <>
      <CreateReservationForm
        {...formProps}
        dailyActiveReservationCountByDate={
          currentDailyActiveReservationCountByDate
        }
        dailyReservedHoursByDate={currentDailyReservedHoursByDate}
        weekDays={currentWeekDays}
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

        <ActiveReservationsList
          onReservationCancelled={handleReservationCancelled}
          reservations={activeReservations}
        />
      </section>
    </>
  );
}
