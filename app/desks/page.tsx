import { LunchReservationStatus, ReservationStatus } from "@prisma/client";

import { createLunchReservationAction } from "@/app/lunch/actions";
import { PageHeader } from "@/components/app/page-header";
import { DeskReservationForm } from "@/components/desks/desk-reservation-form";
import { UrlToast } from "@/components/ui/url-toast";
import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { endOfLocalDay, getBuildingWorkingWindowForDate, startOfLocalDay } from "@/lib/desk-schedule";
import {
  formatJalaliDate,
  formatJalaliDateParam,
  formatPersianLocalTime,
  parseJalaliDateParam,
} from "@/lib/jalali-date";
import { getLunchDayState } from "@/lib/lunch-service";

type Props = { searchParams?: Promise<{ cancelled?: string; created?: string; date?: string; error?: string; buildingId?: string; updated?: string }> };

function hourOptions(startTime: string | null, endTime: string | null) {
  const start = Number(startTime?.slice(0, 2) ?? 9);
  const end = Number(endTime?.slice(0, 2) ?? 17);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

export default async function DesksPage({ searchParams }: Props) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const date = parseJalaliDateParam(params?.date) ?? startOfLocalDay(new Date());
  const dateParam = formatJalaliDateParam(date);
  const [buildings, lunchBuildings, lunchReservation, lunchDayState] = await Promise.all([
    db.building.findMany({
      where: { active: true, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { desks: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    }),
    db.building.findMany({
      where: { active: true, isTransitional: false }, orderBy: { name: "asc" }, select: { id: true, name: true },
    }),
    db.lunchReservation.findFirst({
      where: { userId: user.id, date: startOfLocalDay(date), status: LunchReservationStatus.ACTIVE },
      select: { breakfastReserved: true, id: true, buildingId: true, lunchReserved: true },
    }),
    getLunchDayState({ date, now: new Date() }),
  ]);
  const building = buildings.find((item) => item.id === params?.buildingId) ?? buildings[0] ?? null;
  const window = building ? await getBuildingWorkingWindowForDate({ date, buildingId: building.id }) : null;
  const reservations = building ? await db.deskReservation.findMany({
    where: {
      desk: { buildingId: building.id },
      startAt: { gte: startOfLocalDay(date), lt: endOfLocalDay(date) },
      status: { in: [ReservationStatus.PENDING, ReservationStatus.APPROVED] },
    },
    orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
    include: { user: { select: { id: true, name: true } } },
  }) : [];
  const myReservation = reservations.find((item) => item.userId === user.id) ?? null;
  const hours = hourOptions(window?.startTime ?? null, window?.endTime ?? null);
  const serializedReservations = reservations.map((item) => ({
    deskId: item.deskId,
    endHour: item.endAt.getHours(),
    id: item.id,
    startHour: item.startAt.getHours(),
    status: item.status as "APPROVED" | "PENDING",
    userId: item.user.id,
    userName: item.user.name,
  }));
  const serializedMine = serializedReservations.find((item) => item.id === myReservation?.id);
  const toast = params?.error ? { consumeKeys: ["error"], message: params.error, variant: "error" as const } :
    params?.created ? { consumeKeys: ["created"], message: "درخواست رزرو میز ثبت شد و در انتظار تأیید مدیر است.", variant: "success" as const } :
    params?.updated ? { consumeKeys: ["updated"], message: "رزرو میز ویرایش شد.", variant: "success" as const } :
    params?.cancelled ? { consumeKeys: ["cancelled"], message: "رزرو میز لغو شد.", variant: "success" as const } : null;

  return <div className="grid gap-3" dir="rtl">
    <PageHeader title="رزرو میز" subtitle="دفتر، تاریخ و زمان حضور خود را انتخاب کنید و میز مناسب را از روی نقشه رزرو کنید." />
    {toast ? <UrlToast {...toast} /> : null}
    {!building ? <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">هنوز دفتر فعالی تعریف نشده است.</p> :
      <DeskReservationForm
        closedReason={window?.reason ?? undefined}
        currentUserId={user.id}
        date={dateParam}
        dateLabel={formatJalaliDate(date)}
        defaultEndHour={myReservation?.endAt.getHours() ?? hours.at(-1) ?? 17}
        defaultStartHour={myReservation?.startAt.getHours() ?? hours[0] ?? 9}
        desks={building.desks.map((desk) => ({ active: desk.active, id: desk.id, name: desk.name }))}
        hours={hours}
        isFullDay={Boolean(myReservation && myReservation.startAt.getHours() === hours[0] && myReservation.endAt.getHours() === hours.at(-1))}
        isWorkingDay={Boolean(window?.isWorkingDay)}
        isStarted={Boolean(myReservation && myReservation.startAt <= new Date())}
        lunchAvailability={{
          cutoffLabel: `مهلت رزرو غذا تا ${formatJalaliDate(lunchDayState.cutoffAt)}، ${formatPersianLocalTime(lunchDayState.cutoffAt)}`,
          existingReservation: lunchReservation,
          isOpen: lunchDayState.isOpen && lunchBuildings.length > 0,
          unavailableReason: lunchReservation ? null : lunchBuildings.length === 0 ? "هنوز ساختمانی برای دریافت غذا تعریف نشده است." : lunchDayState.isServiceDay ? `مهلت رزرو غذا گذشته است. مهلت تا ${formatJalaliDate(lunchDayState.cutoffAt)}، ${formatPersianLocalTime(lunchDayState.cutoffAt)} بود.` : "برای این تاریخ سرویس غذا فعال نیست.",
        }}
        lunchReservationAction={createLunchReservationAction}
        myReservation={serializedMine}
        buildingId={building.id}
        buildingName={building.name}
        lunchBuildings={lunchBuildings}
        reservations={serializedReservations}
      />}
  </div>;
}
