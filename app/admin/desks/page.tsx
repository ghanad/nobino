import { UserRole } from "@prisma/client";
import Link from "next/link";

import { createDeskAction, createOfficeAction, deleteOfficeExceptionAction, updateDeskAction, updateDeskSettingsAction, updateOfficeAction, updateOfficeScheduleAction, upsertOfficeExceptionAction } from "@/app/admin/desks/actions";
import { PageHeader } from "@/components/app/page-header";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatJalaliDate } from "@/lib/jalali-date";

type Props = { searchParams?: Promise<Record<string, string | undefined>> };
const days = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
const input = "h-10 min-w-0 rounded-md border bg-background px-3 text-sm";

export default async function AdminDesksPage({ searchParams }: Props) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const [offices, settings] = await Promise.all([
    db.office.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { desks: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }, exceptions: { orderBy: { date: "desc" }, take: 20 }, weeklySchedules: { orderBy: { dayOfWeek: "asc" } } } }),
    db.deskSettings.upsert({ where: { id: "default" }, update: {}, create: { id: "default", maxAdvanceDays: 14 } }),
  ]);
  const office = offices.find((item) => item.id === params?.officeId) ?? offices[0] ?? null;
  const success = params?.officeCreated ? "دفتر ایجاد شد." : params?.officeUpdated ? "دفتر به‌روزرسانی شد." : params?.deskCreated ? "میز ایجاد شد." : params?.deskUpdated ? "میز به‌روزرسانی شد." : params?.settingsUpdated ? "تنظیمات رزرو ذخیره شد." : params?.scheduleUpdated ? "برنامه کاری ذخیره شد." : params?.exceptionSaved ? "استثنای تقویم ذخیره شد." : params?.exceptionDeleted ? "استثنا حذف شد." : null;
  const toast = params?.error ? { consumeKeys: ["error"], message: params.error, variant: "error" as const } : success ? { consumeKeys: ["officeCreated", "officeUpdated", "deskCreated", "deskUpdated", "settingsUpdated", "scheduleUpdated", "exceptionSaved", "exceptionDeleted"], message: success, variant: "success" as const } : null;

  return <div className="grid gap-6" dir="rtl">
    <PageHeader title="دفترها و میزها" subtitle="تعریف دفتر، نام میزها، زمان‌بندی و بازه مجاز رزرو" />
    {toast ? <UrlToast {...toast} /> : null}
    <section className="grid gap-4 rounded-lg border bg-card p-5 md:grid-cols-2">
      <form action={updateDeskSettingsAction} className="grid gap-3"><h2 className="font-semibold">سیاست رزرو میز</h2><label className="grid gap-1 text-sm">حداکثر رزرو از قبل (روز)<input className={input} defaultValue={settings.maxAdvanceDays} max={365} min={1} name="maxAdvanceDays" type="number" /></label><SubmitButton pendingLabel="در حال ذخیره">ذخیره</SubmitButton></form>
      <form action={createOfficeAction} className="grid gap-3"><h2 className="font-semibold">دفتر جدید</h2><input className={input} name="name" placeholder="نام دفتر" required /><input className={input} defaultValue={offices.length + 1} min={0} name="sortOrder" type="number" /><SubmitButton pendingLabel="در حال ایجاد">ایجاد دفتر</SubmitButton></form>
    </section>
    <nav className="flex flex-wrap gap-2">{offices.map((item) => <Link className={`rounded-md border px-4 py-2 text-sm ${item.id === office?.id ? "bg-primary text-primary-foreground" : "bg-card"}`} href={`/admin/desks?officeId=${item.id}`} key={item.id}>{item.name}</Link>)}</nav>
    {office ? <>
      <section className="grid gap-4 rounded-lg border bg-card p-5">
        <h2 className="font-semibold">مشخصات دفتر</h2><form action={updateOfficeAction} className="grid gap-3 md:grid-cols-4"><input name="officeId" type="hidden" value={office.id} /><input className={input} defaultValue={office.name} name="name" required /><input className={input} defaultValue={office.sortOrder} min={0} name="sortOrder" type="number" /><label className="flex items-center gap-2 text-sm"><input defaultChecked={office.active} name="active" type="checkbox" /> فعال</label><SubmitButton pendingLabel="در حال ذخیره">ذخیره دفتر</SubmitButton></form>
      </section>
      <section className="grid gap-4 rounded-lg border bg-card p-5"><h2 className="font-semibold">میزها</h2>
        {office.desks.map((desk) => <form action={updateDeskAction} className="grid gap-3 rounded-md border p-3 md:grid-cols-4" key={desk.id}><input name="deskId" type="hidden" value={desk.id} /><input name="officeId" type="hidden" value={office.id} /><input className={input} defaultValue={desk.name} name="name" required /><input className={input} defaultValue={desk.sortOrder} min={0} name="sortOrder" type="number" /><label className="flex items-center gap-2 text-sm"><input defaultChecked={desk.active} name="active" type="checkbox" /> فعال</label><SubmitButton pendingLabel="در حال ذخیره">ذخیره</SubmitButton></form>)}
        <form action={createDeskAction} className="grid gap-3 rounded-md border border-dashed p-3 md:grid-cols-3"><input name="officeId" type="hidden" value={office.id} /><input className={input} name="name" placeholder="نام میز جدید" required /><input className={input} defaultValue={office.desks.length + 1} min={0} name="sortOrder" type="number" /><SubmitButton pendingLabel="در حال ایجاد">افزودن میز</SubmitButton></form>
      </section>
      <section className="grid gap-3 rounded-lg border bg-card p-5"><h2 className="font-semibold">برنامه هفتگی</h2>{days.map((label, dayOfWeek) => {
        const schedule = office.weeklySchedules.find((item) => item.dayOfWeek === dayOfWeek);
        return <form action={updateOfficeScheduleAction} className="grid gap-2 rounded-md border p-3 sm:grid-cols-5" key={dayOfWeek}><input name="officeId" type="hidden" value={office.id} /><input name="dayOfWeek" type="hidden" value={dayOfWeek} /><strong className="text-sm">{label}</strong><label className="flex items-center gap-2 text-sm"><input defaultChecked={schedule?.isWorkingDay} name="isWorkingDay" type="checkbox" /> روز کاری</label><input className={input} defaultValue={schedule?.startTime ?? "09:00"} name="startTime" type="time" /><input className={input} defaultValue={schedule?.endTime ?? "17:00"} name="endTime" type="time" /><SubmitButton pendingLabel="ذخیره">ذخیره</SubmitButton></form>;
      })}</section>
      <section className="grid gap-4 rounded-lg border bg-card p-5"><h2 className="font-semibold">استثنای تاریخ</h2><form action={upsertOfficeExceptionAction} className="grid gap-3 md:grid-cols-3"><input name="officeId" type="hidden" value={office.id} /><JalaliDatePicker name="date" required /><label className="flex items-center gap-2 text-sm"><input name="isWorkingDay" type="checkbox" /> روز کاری</label><input className={input} defaultValue="09:00" name="startTime" type="time" /><input className={input} defaultValue="17:00" name="endTime" type="time" /><input className={input} name="reason" placeholder="دلیل (اختیاری)" /><SubmitButton pendingLabel="در حال ذخیره">ثبت یا جایگزینی استثنا</SubmitButton></form>
        {office.exceptions.map((exception) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm" key={exception.id}><span>{formatJalaliDate(exception.date)} — {exception.isWorkingDay ? `${exception.startTime} تا ${exception.endTime}` : "تعطیل"}{exception.reason ? ` — ${exception.reason}` : ""}</span><form action={deleteOfficeExceptionAction}><input name="exceptionId" type="hidden" value={exception.id} /><input name="officeId" type="hidden" value={office.id} /><SubmitButton pendingLabel="حذف" variant="outline">حذف</SubmitButton></form></div>)}
      </section>
    </> : null}
  </div>;
}
