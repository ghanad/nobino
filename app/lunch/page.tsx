import { LunchReservationStatus } from "@prisma/client";

import { LunchReservationList } from "@/app/lunch/lunch-reservation-list";
import { PageHeader } from "@/components/app/page-header";
import { UrlToast } from "@/components/ui/url-toast";
import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatJalaliDate,
  formatJalaliDateParam,
  formatPersianLocalTime,
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
  const rows = days.map((date, index) => {
    const dateParam = formatJalaliDateParam(date);
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
      cutoffLabel: `مهلت رزرو، تغییر یا لغو تا ${formatJalaliDate(dayState.cutoffAt)}، ${formatPersianLocalTime(dayState.cutoffAt)}`,
      dateLabel: formatJalaliDate(date),
      dateParam,
      isActionDisabled: !dayState.isOpen || locations.length === 0,
      isOpen: dayState.isOpen,
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
    <div className="grid gap-6 text-right" dir="rtl">
      <PageHeader
        subtitle="رزرو روزانه صبحانه و ناهار با یک محل تحویل مشترک"
        title="رزرو غذا"
      />

      {toast ? <UrlToast {...toast} /> : null}

      <section className="grid gap-4 rounded-lg border bg-card p-5 text-card-foreground">
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
