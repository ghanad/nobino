import { ReservationStatus } from "@prisma/client";

import { PageHeader } from "@/components/app/page-header";
import { DeskReservationForm } from "@/components/desks/desk-reservation-form";
import { UrlToast } from "@/components/ui/url-toast";
import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { endOfLocalDay, getOfficeWorkingWindowForDate, startOfLocalDay } from "@/lib/desk-schedule";
import { formatJalaliDate, formatJalaliDateParam, parseJalaliDateParam } from "@/lib/jalali-date";

type Props = { searchParams?: Promise<{ cancelled?: string; created?: string; date?: string; error?: string; officeId?: string; updated?: string }> };

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
  const offices = await db.office.findMany({
    where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { desks: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });
  const office = offices.find((item) => item.id === params?.officeId) ?? offices[0] ?? null;
  const window = office ? await getOfficeWorkingWindowForDate({ date, officeId: office.id }) : null;
  const reservations = office ? await db.deskReservation.findMany({
    where: {
      desk: { officeId: office.id },
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
    {!office ? <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">هنوز دفتر فعالی تعریف نشده است.</p> : !window?.isWorkingDay ?
      <p className="rounded-lg border bg-card p-5 text-sm">{window?.reason ? `دفتر در ${formatJalaliDate(date)} تعطیل است: ${window.reason}` : "دفتر در این روز فعال نیست."}</p> :
      <DeskReservationForm
        currentUserId={user.id}
        date={dateParam}
        dateLabel={formatJalaliDate(date)}
        defaultEndHour={myReservation?.endAt.getHours() ?? hours.at(-1) ?? 17}
        defaultStartHour={myReservation?.startAt.getHours() ?? hours[0] ?? 9}
        desks={office.desks.map((desk) => ({ active: desk.active, id: desk.id, name: desk.name }))}
        hours={hours}
        isFullDay={Boolean(myReservation && myReservation.startAt.getHours() === hours[0] && myReservation.endAt.getHours() === hours.at(-1))}
        isStarted={Boolean(myReservation && myReservation.startAt <= new Date())}
        myReservation={serializedMine}
        officeId={office.id}
        officeName={office.name}
        offices={offices.map((item) => ({ id: item.id, name: item.name }))}
        reservations={serializedReservations}
      />}
  </div>;
}
