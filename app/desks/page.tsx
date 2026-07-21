import { ReservationStatus } from "@prisma/client";

import { cancelOwnDeskReservationAction } from "@/app/desks/actions";
import { PageHeader } from "@/components/app/page-header";
import { DeskReservationForm } from "@/components/desks/desk-reservation-form";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { endOfLocalDay, getOfficeWorkingWindowForDate, startOfLocalDay } from "@/lib/desk-schedule";
import { formatJalaliDate, formatJalaliDateParam, formatPersianLocalTime, parseJalaliDateParam } from "@/lib/jalali-date";

type Props = { searchParams?: Promise<{ cancelled?: string; created?: string; date?: string; error?: string; officeId?: string; updated?: string }> };
const inputClass = "h-10 rounded-md border bg-background px-3 text-sm";

function hourOptions(startTime: string | null, endTime: string | null) {
  const start = Number(startTime?.slice(0, 2) ?? 9);
  const end = Number(endTime?.slice(0, 2) ?? 17);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
}

export default async function DesksPage({ searchParams }: Props) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const date = parseJalaliDateParam(params?.date) ?? startOfLocalDay(new Date());
  const dateParam = formatJalaliDateParam(date);
  const offices = await db.office.findMany({
    where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { desks: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
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
    include: { desk: true, user: { select: { id: true, name: true } } },
  }) : [];
  const myReservation = reservations.find((item) => item.userId === user.id) ?? null;
  const hours = hourOptions(window?.startTime ?? null, window?.endTime ?? null);
  const toast = params?.error ? { consumeKeys: ["error"], message: params.error, variant: "error" as const } :
    params?.created ? { consumeKeys: ["created"], message: "درخواست رزرو میز ثبت شد و در انتظار تأیید مدیر است.", variant: "success" as const } :
    params?.updated ? { consumeKeys: ["updated"], message: "رزرو میز ویرایش شد.", variant: "success" as const } :
    params?.cancelled ? { consumeKeys: ["cancelled"], message: "رزرو میز لغو شد.", variant: "success" as const } : null;

  return <div className="grid gap-6" dir="rtl">
    <PageHeader title="رزرو میز" subtitle="میز کار خود را به‌صورت ساعتی یا برای کل روز رزرو کنید" />
    {toast ? <UrlToast {...toast} /> : null}
    <form className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3" method="get">
      <label className="grid gap-1 text-sm">دفتر<select className={inputClass} defaultValue={office?.id} name="officeId">{offices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">تاریخ<JalaliDatePicker name="date" required value={dateParam} /></label>
      <button className="mt-auto h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground" type="submit">نمایش</button>
    </form>

    {!office ? <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">هنوز دفتر فعالی تعریف نشده است.</p> : !window?.isWorkingDay ?
      <p className="rounded-lg border bg-card p-5 text-sm">{window?.reason ? `دفتر در ${formatJalaliDate(date)} تعطیل است: ${window.reason}` : "دفتر در این روز فعال نیست."}</p> : <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {office.desks.map((desk) => {
          const deskReservations = reservations.filter((item) => item.deskId === desk.id);
          return <article className="grid gap-3 rounded-lg border bg-card p-4" key={desk.id}>
            <h2 className="font-semibold">{desk.name}</h2>
            {deskReservations.length ? deskReservations.map((reservation) => <div className={reservation.status === ReservationStatus.PENDING ? "rounded-md bg-amber-50 p-3 text-sm" : "rounded-md bg-slate-50 p-3 text-sm"} key={reservation.id}>
              <div className="flex items-center justify-between gap-2"><span className="font-medium">{reservation.user.name}</span>{reservation.status === ReservationStatus.PENDING ? <span className="text-xs text-amber-700">در انتظار تأیید</span> : null}</div>
              <div>{formatPersianLocalTime(reservation.startAt)} تا {formatPersianLocalTime(reservation.endAt)}</div>
            </div>) : <p className="text-sm text-emerald-700">تمام روز آزاد است</p>}
          </article>;
        })}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4 sm:px-6">
          <h2 className="font-semibold text-slate-950">{myReservation ? "ویرایش رزرو من" : "رزرو میز"}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {myReservation ? "میز یا ساعت درخواست را تغییر دهید؛ در زمان تأیید، آزاد بودن بازه دوباره بررسی می‌شود." : "میز و مدت حضورتان را مشخص کنید؛ درخواست پس از بررسی مدیر نهایی می‌شود."}
          </p>
        </div>
        <DeskReservationForm
          date={dateParam}
          defaultDeskId={myReservation?.deskId ?? office.desks[0]?.id ?? ""}
          defaultEndHour={myReservation?.endAt.getHours() ?? hours.at(-1) ?? 17}
          defaultStartHour={myReservation?.startAt.getHours() ?? hours[0] ?? 9}
          desks={office.desks.map((desk) => ({ id: desk.id, name: desk.name }))}
          hours={hours}
          isFullDay={Boolean(myReservation && myReservation.startAt.getHours() === hours[0] && myReservation.endAt.getHours() === hours.at(-1))}
          isStarted={Boolean(myReservation && myReservation.startAt <= new Date())}
          officeId={office.id}
          reservationId={myReservation?.id}
        />
        {myReservation ? <form action={cancelOwnDeskReservationAction} className="flex justify-end border-t px-5 py-3 sm:px-6"><input name="reservationId" type="hidden" value={myReservation.id} /><input name="date" type="hidden" value={dateParam} /><input name="officeId" type="hidden" value={office.id} /><SubmitButton className="text-red-600 hover:bg-red-50 hover:text-red-700" pendingLabel="در حال لغو" variant="ghost">لغو کامل رزرو</SubmitButton></form> : null}
      </section>
    </>}
  </div>;
}
