import { UserRole } from "@prisma/client";

import { PageHeader } from "@/components/app/page-header";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ADMIN_PAGE_LABELS,
  getAdminToast,
  ReservationPolicySettings,
} from "@/app/admin/_sections";

type AdminReservationPolicyPageProps = {
  searchParams?: Promise<{
    error?: string;
    reservationPolicyUpdated?: string;
  }>;
};

const DEFAULT_RESERVATION_POLICY = {
  autoAcceptDelayHours: 4,
  autoAcceptEnabled: false,
  dailyUserHourLimit: 3,
  oneReservationPerDayEnabled: true,
};

export default async function AdminReservationPolicyPage({
  searchParams,
}: AdminReservationPolicyPageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const toast = getAdminToast(params);
  const reservationPolicy = await db.reservationPolicy.findUnique({
    where: { id: "default" },
    select: {
      autoAcceptDelayHours: true,
      autoAcceptEnabled: true,
      dailyUserHourLimit: true,
      oneReservationPerDayEnabled: true,
    },
  });

  const policyValues = reservationPolicy ?? DEFAULT_RESERVATION_POLICY;

  return (
    <div className="grid gap-6">
      <PageHeader
        subtitle="تنظیم محدودیت‌های کاربران و فرایند تأیید درخواست‌ها"
        title={ADMIN_PAGE_LABELS.reservationPolicy}
      />

      {toast ? <UrlToast {...toast} /> : null}
      <ReservationPolicySettings
        autoAcceptDelayHours={policyValues.autoAcceptDelayHours}
        autoAcceptEnabled={policyValues.autoAcceptEnabled}
        dailyUserHourLimit={policyValues.dailyUserHourLimit}
        oneReservationPerDayEnabled={policyValues.oneReservationPerDayEnabled}
      />
    </div>
  );
}
