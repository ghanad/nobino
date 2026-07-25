import { ReservationStatus, UserRole } from "@prisma/client";

import { approveDeskReservationAction, cancelDeskReservationByManagerAction, rejectDeskReservationAction, updateDeskReservationByManagerAction } from "@/app/manager/desks/actions";
import { PageHeader } from "@/components/app/page-header";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatJalaliDate, formatJalaliDateParam, formatPersianLocalTime } from "@/lib/jalali-date";

type Props = { searchParams?: Promise<{ approved?: string; cancelled?: string; error?: string; rejected?: string; updated?: string }> };
const inputClass = "h-10 rounded-md border bg-background px-3 text-sm";

export default async function ManagerDesksPage({ searchParams }: Props) {
  await requireRole([UserRole.MANAGER, UserRole.ADMIN]);
  const params = await searchParams;
  const [reservations, offices] = await Promise.all([
    db.deskReservation.findMany({
      where: { endAt: { gt: new Date() }, status: { in: [ReservationStatus.PENDING, ReservationStatus.APPROVED] } },
      orderBy: { startAt: "asc" }, include: { desk: { include: { office: true } }, user: { select: { email: true, name: true } } },
    }),
    db.office.findMany({ where: { active: true, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { desks: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } } }),
  ]);
  const toast = params?.error ? { consumeKeys: ["error"], message: params.error, variant: "error" as const } :
    params?.approved ? { consumeKeys: ["approved"], message: "درخواست رزرو میز تأیید شد.", variant: "success" as const } :
    params?.rejected ? { consumeKeys: ["rejected"], message: "درخواست رزرو میز رد شد.", variant: "success" as const } :
    params?.updated ? { consumeKeys: ["updated"], message: "رزرو میز تغییر کرد.", variant: "success" as const } :
    params?.cancelled ? { consumeKeys: ["cancelled"], message: "رزرو میز لغو شد.", variant: "success" as const } : null;

  return <div className="grid gap-6" dir="rtl">
    <PageHeader title="مدیریت رزرو میزها" subtitle="بررسی، تأیید، ویرایش یا لغو درخواست‌های همکاران" />
    {toast ? <UrlToast {...toast} /> : null}
    <section className="grid gap-4">
      {reservations.length === 0 ? <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">رزرو فعال یا آینده‌ای وجود ندارد.</p> : reservations.map((reservation) =>
        <article className="grid gap-4 rounded-lg border bg-card p-5" key={reservation.id}>
          <div className="text-sm leading-7"><div className="flex flex-wrap items-center gap-2"><strong>{reservation.user.name}</strong><span className={reservation.status === ReservationStatus.PENDING ? "rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700" : "rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"}>{reservation.status === ReservationStatus.PENDING ? "در انتظار تأیید" : "تأییدشده"}</span></div>({reservation.user.email}) — {reservation.desk.office.name}، {reservation.desk.name}<br />{formatJalaliDate(reservation.startAt)}، {formatPersianLocalTime(reservation.startAt)} تا {formatPersianLocalTime(reservation.endAt)}</div>
          <form action={updateDeskReservationByManagerAction} className="grid gap-3 md:grid-cols-5">
            <input name="reservationId" type="hidden" value={reservation.id} />
            <JalaliDatePicker disabled={reservation.startAt <= new Date()} name="date" required value={formatJalaliDateParam(reservation.startAt)} />
            {reservation.startAt <= new Date() ? <input name="date" type="hidden" value={formatJalaliDateParam(reservation.startAt)} /> : null}
            <select className={inputClass} defaultValue={reservation.deskId} disabled={reservation.startAt <= new Date()} name="deskId">{offices.map((office) => <optgroup key={office.id} label={office.name}>{office.desks.map((desk) => <option key={desk.id} value={desk.id}>{desk.name}</option>)}</optgroup>)}</select>
            {reservation.startAt <= new Date() ? <input name="deskId" type="hidden" value={reservation.deskId} /> : null}
            <input className={inputClass} defaultValue={reservation.startAt.getHours()} max={23} min={0} name="startHour" readOnly={reservation.startAt <= new Date()} type="number" />
            <input className={inputClass} defaultValue={reservation.endAt.getHours()} max={24} min={1} name="endHour" type="number" />
            <SubmitButton pendingLabel="در حال ذخیره">ذخیره</SubmitButton>
          </form>
          <div className="flex flex-wrap gap-2">
            {reservation.status === ReservationStatus.PENDING ? <><form action={approveDeskReservationAction}><input name="reservationId" type="hidden" value={reservation.id} /><SubmitButton pendingLabel="در حال تأیید">تأیید درخواست</SubmitButton></form><form action={rejectDeskReservationAction}><input name="reservationId" type="hidden" value={reservation.id} /><SubmitButton pendingLabel="در حال رد" variant="outline">رد درخواست</SubmitButton></form></> : null}
            <form action={cancelDeskReservationByManagerAction}><input name="reservationId" type="hidden" value={reservation.id} /><SubmitButton pendingLabel="در حال لغو" variant="outline">لغو رزرو</SubmitButton></form>
          </div>
        </article>)}
    </section>
  </div>;
}
