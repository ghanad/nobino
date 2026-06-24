"use client";

import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import Link from "next/link";

import {
  ActiveReservationsList,
  type ActiveReservation,
} from "@/app/reservations/active-reservations-list";
import type { LunchActionState } from "@/app/lunch/actions";
import type { CreateReservationActionState } from "@/app/reservations/actions";
import {
  CreateReservationForm,
  type CreateReservationFormProps,
  type WeekDay,
} from "@/components/reservation/create-reservation-form";
import { Button } from "@/components/ui/button";
import { formatJalaliDateParam } from "@/lib/jalali-date";

type ReservationsInteractiveSectionProps = CreateReservationFormProps & {
  activeReservations: ActiveReservation[];
  activeLunchReservationByDate: Record<string, { id: string }>;
  autoAcceptEnabled: boolean;
  cancelLunchReservationAction: (
    previousState: LunchActionState,
    formData: FormData,
  ) => Promise<LunchActionState>;
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

function incrementDateValue(
  valuesByDate: Record<string, number>,
  dateParam: string,
  amount: number,
) {
  return {
    ...valuesByDate,
    [dateParam]: (valuesByDate[dateParam] ?? 0) + amount,
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

function addPendingReservationToWeekDays(
  weekDays: WeekDay[],
  mutation: NonNullable<CreateReservationActionState["mutation"]>,
): WeekDay[] {
  const startAt = new Date(mutation.startAt);
  const endAt = new Date(mutation.endAt);
  const startHour = startAt.getHours();
  const endHour = endAt.getHours();
  const dateParam = formatJalaliDateParam(startAt);
  const pendingReservation = {
    email: mutation.userEmail,
    id: mutation.reservationId,
    partySize: mutation.partySize,
    userId: mutation.userId,
    userName: mutation.userName,
  };

  return weekDays.map((day) => {
    if (day.dateParam !== dateParam) {
      return day;
    }

    return {
      ...day,
      slots: day.slots.map((slot) => {
        if (slot.slotStartHour < startHour || slot.slotStartHour >= endHour) {
          return slot;
        }

        return {
          ...slot,
          myReservationId: mutation.reservationId,
          myReservationStatus: "PENDING",
          pendingCount: slot.pendingCount + 1,
          pendingReservations: [
            ...slot.pendingReservations.filter(
              (reservation) => reservation.id !== mutation.reservationId,
            ),
            pendingReservation,
          ],
        };
      }),
    };
  });
}

export function ReservationsInteractiveSection({
  activeReservations,
  activeLunchReservationByDate,
  autoAcceptEnabled,
  cancelLunchReservationAction,
  dailyActiveReservationCountByDate,
  dailyReservedHoursByDate,
  weekDays,
  ...formProps
}: ReservationsInteractiveSectionProps) {
  const [currentWeekDays, setCurrentWeekDays] = useState(weekDays);
  const [currentActiveReservations, setCurrentActiveReservations] =
    useState(activeReservations);
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
    setCurrentActiveReservations(activeReservations);
  }, [activeReservations]);

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
      setCurrentActiveReservations((previousReservations) =>
        previousReservations.filter((item) => item.id !== reservation.id),
      );
    },
    [],
  );

  const handleReservationCreated = useCallback(
    (mutation: NonNullable<CreateReservationActionState["mutation"]>) => {
      const startAt = new Date(mutation.startAt);
      const endAt = new Date(mutation.endAt);
      const createdAt = new Date(mutation.createdAt);
      const dateParam = formatJalaliDateParam(startAt);
      const reservation: ActiveReservation = {
        id: mutation.reservationId,
        autoAcceptAt: mutation.autoAcceptAt ? new Date(mutation.autoAcceptAt) : null,
        startAt,
        endAt,
        partySize: mutation.partySize,
        resourcePoolId: mutation.resourcePoolId,
        status: "PENDING" as ActiveReservation["status"],
        reason: mutation.reason,
        rejectionReason: null,
        resourcePool: {
          name: mutation.resourcePoolName,
        },
        alternatives: [],
        createdAt,
        updatedAt: createdAt,
      };

      setCurrentWeekDays((previousWeekDays) =>
        addPendingReservationToWeekDays(previousWeekDays, mutation),
      );
      setCurrentDailyActiveReservationCountByDate((previousCounts) =>
        incrementDateValue(previousCounts, dateParam, 1),
      );
      setCurrentDailyReservedHoursByDate((previousHours) =>
        incrementDateValue(
          previousHours,
          dateParam,
          getReservationDurationHours(reservation),
        ),
      );
      setCurrentActiveReservations((previousReservations) => [
        reservation,
        ...previousReservations.filter((item) => item.id !== reservation.id),
      ]);
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
        onReservationCreated={handleReservationCreated}
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
        activeLunchReservationByDate={activeLunchReservationByDate}
        autoAcceptEnabled={autoAcceptEnabled}
        cancelLunchReservationAction={cancelLunchReservationAction}
          onReservationCancelled={handleReservationCancelled}
          reservations={currentActiveReservations}
        />
      </section>
    </>
  );
}
