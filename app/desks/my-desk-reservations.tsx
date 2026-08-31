import { ReservationStatus } from "@prisma/client";

import { cancelOwnDeskReservationAction } from "@/app/desks/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  formatJalaliDate,
  formatPersianLocalTime,
} from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

type MyDeskReservation = {
  buildingName: string;
  deskName: string;
  endAt: Date;
  id: string;
  startAt: Date;
  status: ReservationStatus;
};

export function MyDeskReservations({
  buildingId,
  date,
  reservations,
}: {
  buildingId: string;
  date: string;
  reservations: MyDeskReservation[];
}) {
  return (
    <section
      aria-labelledby="my-desk-reservations-title"
      className="rounded-lg border bg-card p-4 text-right sm:p-5"
      dir="rtl"
    >
      <div className="mb-4 grid gap-1">
        <h2 className="text-base font-semibold" id="my-desk-reservations-title">
          درخواست‌های من
        </h2>
        <p className="text-sm text-muted-foreground">
          رزروهای جاری و آینده میز کار را اینجا پیگیری کنید.
        </p>
      </div>

      {reservations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          درخواست فعال یا رزرو آینده‌ای ندارید.
        </p>
      ) : (
        <div className="grid gap-2">
          {reservations.map((reservation) => {
            const isApproved = reservation.status === ReservationStatus.APPROVED;

            return (
              <article
                className={cn(
                  "flex flex-col gap-3 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between",
                  isApproved
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-amber-200 bg-amber-50 text-amber-950",
                )}
                key={reservation.id}
              >
                <div className="grid gap-1 leading-6">
                  <p className="font-semibold">
                    {reservation.deskName} · {reservation.buildingName}
                  </p>
                  <p>
                    {formatJalaliDate(reservation.startAt)}، {formatPersianLocalTime(reservation.startAt)} تا {formatPersianLocalTime(reservation.endAt)}
                  </p>
                  <p className="text-xs font-medium">
                    {isApproved ? "تأییدشده" : "در انتظار تأیید"}
                  </p>
                </div>

                <form action={cancelOwnDeskReservationAction}>
                  <input name="reservationId" type="hidden" value={reservation.id} />
                  <input name="date" type="hidden" value={date} />
                  <input name="buildingId" type="hidden" value={buildingId} />
                  <SubmitButton
                    className="h-11 w-full border-current/20 bg-white/70 px-4 text-red-700 hover:bg-red-50 sm:h-10 sm:w-auto"
                    pendingLabel="در حال لغو"
                    variant="outline"
                  >
                    لغو رزرو
                  </SubmitButton>
                </form>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
