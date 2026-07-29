import { LunchReservationStatus } from "@prisma/client";
import { Clock3, UtensilsCrossed } from "lucide-react";

import { LunchReservationList } from "@/app/lunch/lunch-reservation-list";
import { UrlToast } from "@/components/ui/url-toast";
import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatJalaliDateParam,
  formatJalaliDateWithoutWeekday,
  formatPersianLocalTime,
  getJalaliDisplayParts,
} from "@/lib/jalali-date";
import {
  getLunchDayState,
  getLunchReservationWindow,
} from "@/lib/lunch-service";

type LunchPageProps = {
  searchParams?: Promise<{
    cancelled?: string;
    error?: string;
    reserved?: string;
    updated?: string;
  }>;
};

function getLunchToast(params: Awaited<LunchPageProps["searchParams"]>) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  if (params?.reserved) {
    return {
      consumeKeys: ["reserved"],
      message: "رزرو غذا ثبت شد.",
      variant: "success" as const,
    };
  }

  if (params?.updated) {
    return {
      consumeKeys: ["updated"],
      message: "رزرو غذا تغییر کرد.",
      variant: "success" as const,
    };
  }

  if (params?.cancelled) {
    return {
      consumeKeys: ["cancelled"],
      message: "رزرو غذا لغو شد.",
      variant: "success" as const,
    };
  }

  return null;
}

export default async function LunchPage({ searchParams }: LunchPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const toast = getLunchToast(params);
  const [days, locations] = await Promise.all([
    getLunchReservationWindow(),
    db.lunchLocation.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const dayStart = days[0];
  const dayEnd = new Date(
    days[days.length - 1].getFullYear(),
    days[days.length - 1].getMonth(),
    days[days.length - 1].getDate() + 1,
  );
  const [reservations, dayStates] = await Promise.all([
    db.lunchReservation.findMany({
      where: {
        userId: user.id,
        date: {
          gte: dayStart,
          lt: dayEnd,
        },
        status: LunchReservationStatus.ACTIVE,
      },
      select: {
        id: true,
        date: true,
        locationId: true,
        breakfastReserved: true,
        lunchReserved: true,
        location: {
          select: {
            name: true,
          },
        },
      },
    }),
    Promise.all(days.map((date) => getLunchDayState({ date }))),
  ]);
  const reservationByDate = new Map(
    reservations.map((reservation) => [
      formatJalaliDateParam(reservation.date),
      reservation,
    ]),
  );
  const cutoffTimeLabel = formatPersianLocalTime(dayStates[0].cutoffAt);
  const rows = days.map((date, index) => {
    const dateParam = formatJalaliDateParam(date);
    const dateParts = getJalaliDisplayParts(date);
    const reservation = reservationByDate.get(dateParam);
    const dayState = dayStates[index];
    const availabilityVariant = dayState.isOpen
      ? ("open" as const)
      : dayState.isServiceDay
        ? ("closed" as const)
        : ("no-service" as const);

    return {
      availabilityLabel: dayState.isOpen
        ? "قابل رزرو"
        : dayState.isServiceDay
          ? "مهلت گذشته"
          : "بدون سرویس",
      availabilityVariant,
      dateLabel: formatJalaliDateWithoutWeekday(date),
      dateParam,
      isActionDisabled: !dayState.isOpen || locations.length === 0,
      isOpen: dayState.isOpen,
      weekdayLabel: dateParts.weekdayLabel,
      reservation: reservation
        ? {
            id: reservation.id,
            locationId: reservation.locationId,
            locationName: reservation.location.name,
            breakfastReserved: reservation.breakfastReserved,
            lunchReserved: reservation.lunchReserved,
          }
        : null,
    };
  });
  return (
    <div className="grid gap-5 text-right sm:gap-6" dir="rtl">
      <header className="border-b border-border/80 pb-5 sm:pb-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground sm:h-12 sm:w-12">
            <UtensilsCrossed aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold leading-tight text-foreground">
              رزرو غذای روزهای آینده
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-xs leading-5 text-muted-foreground">
              <Clock3 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              مهلت رزرو هر روز تا ساعت {cutoffTimeLabel} روز قبل است.
            </p>
          </div>
        </div>
      </header>

      {toast ? <UrlToast {...toast} /> : null}

      <section
        aria-labelledby="lunch-week-heading"
        className="grid gap-3 text-card-foreground"
      >
        <h2 className="sr-only" id="lunch-week-heading">
          روزهای آینده
        </h2>

        {locations.length === 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            هنوز ساختمان فعالی برای دریافت غذا تعریف نشده است.
          </div>
        ) : null}

        <LunchReservationList locations={locations} rows={rows} />
      </section>
    </div>
  );
}
