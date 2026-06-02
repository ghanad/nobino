import { LunchReservationStatus } from "@prisma/client";
import { Building2, CircleSlash, Pencil, Utensils, X } from "lucide-react";

import {
  cancelLunchReservationAction,
  createLunchReservationAction,
  updateLunchReservationAction,
} from "@/app/lunch/actions";
import { PageHeader } from "@/components/app/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
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
import { cn } from "@/lib/utils";

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
      message: "رزرو ناهار ثبت شد.",
      variant: "success" as const,
    };
  }

  if (params?.updated) {
    return {
      consumeKeys: ["updated"],
      message: "محل دریافت ناهار تغییر کرد.",
      variant: "success" as const,
    };
  }

  if (params?.cancelled) {
    return {
      consumeKeys: ["cancelled"],
      message: "رزرو ناهار لغو شد.",
      variant: "success" as const,
    };
  }

  return null;
}

function LocationSelect({
  currentLocationId,
  disabled,
  locations,
}: {
  currentLocationId?: string;
  disabled: boolean;
  locations: Array<{ id: string; name: string }>;
}) {
  return (
    <select
      className="h-10 min-w-40 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
      defaultValue={currentLocationId ?? locations[0]?.id ?? ""}
      disabled={disabled || locations.length === 0}
      name="locationId"
      required
    >
      {locations.map((location) => (
        <option key={location.id} value={location.id}>
          {location.name}
        </option>
      ))}
    </select>
  );
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

  return (
    <div className="grid gap-6 text-right" dir="rtl">
      <PageHeader
        subtitle="رزرو روزانه ناهار برای روزهای آینده"
        title="رزرو ناهار"
      />

      {toast ? <UrlToast {...toast} /> : null}

      <section className="grid gap-4 rounded-lg border bg-card p-5 text-card-foreground">
        {locations.length === 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            هنوز ساختمان فعالی برای دریافت ناهار تعریف نشده است.
          </div>
        ) : null}

        <div className="grid gap-3">
          {days.map((date, index) => {
            const dateParam = formatJalaliDateParam(date);
            const reservation = reservationByDate.get(dateParam);
            const dayState = dayStates[index];
            const isActionDisabled = !dayState.isOpen || locations.length === 0;

            return (
              <div
                className="grid gap-4 rounded-md border bg-background p-4 md:grid-cols-[1fr_auto] md:items-center"
                key={dateParam}
              >
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">
                      {formatJalaliDate(date)}
                    </h2>
                    <span
                      className={cn(
                        "inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium ring-1",
                        dayState.isOpen
                          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                          : dayState.isServiceDay
                            ? "bg-slate-50 text-slate-700 ring-slate-200"
                            : "bg-rose-50 text-rose-800 ring-rose-200",
                      )}
                    >
                      {dayState.isOpen
                        ? "قابل رزرو"
                        : dayState.isServiceDay
                          ? "مهلت گذشته"
                          : "بدون سرویس"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    مهلت رزرو یا تغییر تا {formatJalaliDate(dayState.cutoffAt)}،{" "}
                    {formatPersianLocalTime(dayState.cutoffAt)}
                  </p>
                  {reservation ? (
                    <p className="flex items-center gap-2 text-sm text-emerald-800">
                      <Building2 className="h-4 w-4" />
                      رزرو شده برای دریافت از {reservation.location.name}
                    </p>
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Utensils className="h-4 w-4" />
                      برای این روز رزرو ناهار ندارید.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {reservation ? (
                    <>
                      <form
                        action={updateLunchReservationAction}
                        className="flex flex-col gap-2 sm:flex-row sm:items-center"
                      >
                        <input name="reservationId" type="hidden" value={reservation.id} />
                        <input name="date" type="hidden" value={dateParam} />
                        <LocationSelect
                          currentLocationId={reservation.locationId}
                          disabled={isActionDisabled}
                          locations={locations}
                        />
                        <SubmitButton
                          disabled={isActionDisabled}
                          pendingLabel="در حال تغییر"
                          variant="outline"
                        >
                          <Pencil className="h-4 w-4" />
                          تغییر
                        </SubmitButton>
                      </form>
                      <form action={cancelLunchReservationAction}>
                        <input name="reservationId" type="hidden" value={reservation.id} />
                        <SubmitButton
                          disabled={isActionDisabled}
                          pendingLabel="در حال لغو"
                          variant="outline"
                        >
                          <X className="h-4 w-4" />
                          لغو
                        </SubmitButton>
                      </form>
                    </>
                  ) : (
                    <form
                      action={createLunchReservationAction}
                      className="flex flex-col gap-2 sm:flex-row sm:items-center"
                    >
                      <input name="date" type="hidden" value={dateParam} />
                      <LocationSelect
                        disabled={isActionDisabled}
                        locations={locations}
                      />
                      <SubmitButton
                        disabled={isActionDisabled}
                        pendingLabel="در حال ثبت"
                      >
                        {dayState.isOpen ? (
                          <Utensils className="h-4 w-4" />
                        ) : (
                          <CircleSlash className="h-4 w-4" />
                        )}
                        رزرو
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
