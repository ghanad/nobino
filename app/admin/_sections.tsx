export { CapacityExceptions } from "./_components/capacity-exceptions-section";
export { ReservationPolicySettings } from "./_components/reservation-policy-settings-section";
export { ResourcePoolSettings } from "./_components/resource-pool-settings-section";
export { ScheduleExceptions } from "./_components/schedule-exceptions-section";
export { UserManagement } from "./_components/user-management-section";
export { WeeklyScheduleSettings } from "./_components/weekly-schedule-settings-section";

type AdminPageProps = {
  searchParams?: Promise<{
    tab?: string;
    error?: string;
    capacityExceptionCreated?: string;
    capacityExceptionDeleted?: string;
    capacityExceptionUpdated?: string;
    exceptionCreated?: string;
    exceptionDeleted?: string;
    exceptionUpdated?: string;
    holidayCreated?: string;
    holidayUpdated?: string;
    holidayDeleted?: string;
    holidayManualPreserved?: string;
    memberAdded?: string;
    passwordReset?: string;
    poolUpdated?: string;
    reservationPolicyUpdated?: string;
    scheduleUpdated?: string;
    userCreated?: string;
    userDeleted?: string;
    userUpdated?: string;
  }>;
};

type AdminTab = "users" | "capacity" | "reservationPolicy" | "schedule";

export const ADMIN_PAGE_LABELS: Record<AdminTab, string> = {
  users: "کاربران",
  capacity: "ظرفیت",
  reservationPolicy: "سیاست رزرو",
  schedule: "زمان‌بندی",
};

export function getAdminToast(params: Awaited<AdminPageProps["searchParams"]>) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  const hasHolidaySyncResult =
    params?.holidayCreated !== undefined ||
    params?.holidayUpdated !== undefined ||
    params?.holidayDeleted !== undefined ||
    params?.holidayManualPreserved !== undefined;
  const holidaySyncMessage = hasHolidaySyncResult
    ? [
        `${params?.holidayCreated ?? "0"} مورد افزوده شد`,
        `${params?.holidayUpdated ?? "0"} مورد اصلاح شد`,
        `${params?.holidayDeleted ?? "0"} مورد قدیمی حذف شد`,
        Number(params?.holidayManualPreserved ?? "0") > 0
          ? `${params?.holidayManualPreserved} استثنای دستی بدون تغییر حفظ شد`
          : null,
      ]
        .filter(Boolean)
        .join("، ") + "."
    : null;

  const successMessage =
    (params?.poolUpdated && "Resource pool settings updated.") ||
    (params?.reservationPolicyUpdated && "Reservation policy updated.") ||
    (params?.capacityExceptionCreated && "Daily capacity exception created.") ||
    (params?.capacityExceptionUpdated && "Daily capacity exception updated.") ||
    (params?.capacityExceptionDeleted && "Daily capacity exception deleted.") ||
    (params?.scheduleUpdated && "برنامه هفتگی ذخیره شد.") ||
    (params?.exceptionCreated && "استثنای تقویم ثبت شد.") ||
    (params?.exceptionUpdated && "تغییرات استثناها ذخیره شد.") ||
    (params?.exceptionDeleted && "استثنای تقویم حذف شد.") ||
    holidaySyncMessage ||
    (params?.memberAdded && "کاربر به تیم اضافه شد.") ||
    (params?.userCreated && "User created.") ||
    (params?.userDeleted && "User deleted.") ||
    (params?.userUpdated && "User updated.") ||
    (params?.passwordReset && "Temporary password set.");

  if (!successMessage) {
    return null;
  }

  return {
    consumeKeys: [
      "poolUpdated",
      "reservationPolicyUpdated",
      "capacityExceptionCreated",
      "capacityExceptionUpdated",
      "capacityExceptionDeleted",
      "scheduleUpdated",
      "exceptionCreated",
      "exceptionUpdated",
      "exceptionDeleted",
      "holidayCreated",
      "holidayUpdated",
      "holidayDeleted",
      "holidayManualPreserved",
      "memberAdded",
      "userCreated",
      "userDeleted",
      "userUpdated",
      "passwordReset",
    ],
    message: successMessage,
    variant: "success" as const,
  };
}
