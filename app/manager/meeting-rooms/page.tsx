import { ReservationStatus, UserRole } from "@prisma/client";

import {
  approveMeetingRoomReservationAction,
  cancelMeetingRoomReservationByManagerAction,
  rejectMeetingRoomReservationAction,
} from "@/app/manager/meeting-rooms/actions";
import { PageHeader } from "@/components/app/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatJalaliDate,
  formatPersianLocalTime,
} from "@/lib/jalali-date";

type ManagerMeetingRoomsPageProps = {
  searchParams?: Promise<{
    approved?: string;
    cancelled?: string;
    error?: string;
    rejected?: string;
  }>;
};

function getToast(params: Awaited<ManagerMeetingRoomsPageProps["searchParams"]>) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  const successMessage =
    (params?.approved && "رزرو اتاق جلسه تایید شد.") ||
    (params?.rejected && "رزرو اتاق جلسه رد شد.") ||
    (params?.cancelled && "رزرو اتاق جلسه لغو شد.");

  return successMessage
    ? {
        consumeKeys: ["approved", "rejected", "cancelled"],
        message: successMessage,
        variant: "success" as const,
      }
    : null;
}

export default async function ManagerMeetingRoomsPage({
  searchParams,
}: ManagerMeetingRoomsPageProps) {
  await requireRole([UserRole.MANAGER, UserRole.ADMIN]);
  const params = await searchParams;
  const toast = getToast(params);
  const reservations = await db.meetingRoomReservation.findMany({
    where: {
      status: {
        in: [ReservationStatus.PENDING, ReservationStatus.APPROVED],
      },
    },
    orderBy: [{ status: "desc" }, { startAt: "asc" }],
    select: {
      endAt: true,
      id: true,
      startAt: true,
      status: true,
      title: true,
      room: {
        select: {
          name: true,
        },
      },
      user: {
        select: {
          email: true,
          name: true,
        },
      },
    },
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        subtitle="درخواست‌های اتاق جلسه جدا از رزرو سیستم‌ها نمایش داده می‌شوند"
        title="بررسی رزرو اتاق جلسه"
      />

      {toast ? <UrlToast {...toast} /> : null}

      <section className="grid gap-3 rounded-lg border bg-card p-5">
        {reservations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            درخواست یا رزرو فعال اتاق جلسه وجود ندارد.
          </p>
        ) : (
          reservations.map((reservation) => (
            <article
              className="grid gap-4 rounded-md border bg-background p-4 md:grid-cols-[1fr_auto]"
              key={reservation.id}
            >
              <div className="grid gap-1 text-sm leading-7">
                <div className="font-semibold">
                  {reservation.room.name} - {formatJalaliDate(reservation.startAt)}
                </div>
                <div>
                  {formatPersianLocalTime(reservation.startAt)} تا{" "}
                  {formatPersianLocalTime(reservation.endAt)}
                </div>
                <div>
                  درخواست‌دهنده: {reservation.user.name} ({reservation.user.email})
                </div>
                {reservation.title ? <div>عنوان: {reservation.title}</div> : null}
                <div>
                  وضعیت:{" "}
                  {reservation.status === ReservationStatus.APPROVED
                    ? "تاییدشده"
                    : "در انتظار تایید"}
                </div>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                {reservation.status === ReservationStatus.PENDING ? (
                  <>
                    <form action={approveMeetingRoomReservationAction}>
                      <input
                        name="reservationId"
                        type="hidden"
                        value={reservation.id}
                      />
                      <SubmitButton pendingLabel="در حال تایید">
                        تایید
                      </SubmitButton>
                    </form>
                    <form
                      action={rejectMeetingRoomReservationAction}
                      className="flex gap-2"
                    >
                      <input
                        name="reservationId"
                        type="hidden"
                        value={reservation.id}
                      />
                      <input
                        className="h-10 w-44 rounded-md border bg-background px-3 text-sm"
                        maxLength={500}
                        name="rejectionReason"
                        placeholder="دلیل رد"
                        type="text"
                      />
                      <SubmitButton pendingLabel="در حال رد" variant="outline">
                        رد
                      </SubmitButton>
                    </form>
                  </>
                ) : null}
                <form action={cancelMeetingRoomReservationByManagerAction}>
                  <input
                    name="reservationId"
                    type="hidden"
                    value={reservation.id}
                  />
                  <SubmitButton pendingLabel="در حال لغو" variant="outline">
                    لغو
                  </SubmitButton>
                </form>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
