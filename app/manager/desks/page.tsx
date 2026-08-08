import { ReservationStatus, UserRole } from "@prisma/client";

import { approveDeskReservationAction, cancelDeskReservationByManagerAction, rejectDeskReservationAction, updateDeskReservationByManagerAction } from "@/app/manager/desks/actions";
import { ManagerDeskReservations } from "@/app/manager/desks/manager-desk-reservations";
import { PageHeader } from "@/components/app/page-header";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

type Props = { searchParams?: Promise<{ approved?: string; cancelled?: string; error?: string; rejected?: string; updated?: string }> };

export default async function ManagerDesksPage({ searchParams }: Props) {
  await requireRole([UserRole.MANAGER, UserRole.ADMIN]);
  const params = await searchParams;
  const [reservations, offices] = await Promise.all([
    db.deskReservation.findMany({
      where: { endAt: { gt: new Date() }, status: { in: [ReservationStatus.PENDING, ReservationStatus.APPROVED] } },
      orderBy: [{ status: "desc" }, { startAt: "asc" }], include: { desk: { include: { office: true } }, user: { select: { email: true, name: true } } },
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
    <ManagerDeskReservations
      actions={{
        approve: approveDeskReservationAction,
        cancel: cancelDeskReservationByManagerAction,
        reject: rejectDeskReservationAction,
        update: updateDeskReservationByManagerAction,
      }}
      initialReservations={reservations}
      offices={offices}
    />
  </div>;
}
