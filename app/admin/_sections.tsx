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
    holidayImported?: string;
    passwordReset?: string;
    poolUpdated?: string;
    reservationPolicyUpdated?: string;
    scheduleUpdated?: string;
    userCreated?: string;
    userDeleted?: string;
    userUpdated?: string;
  }>;
};

type AdminTab = "users" | "capacity" | "schedule";

export const ADMIN_PAGE_LABELS: Record<AdminTab, string> = {
  users: "کاربران",
  capacity: "ظرفیت",
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

  const successMessage =
    (params?.poolUpdated && "Resource pool settings updated.") ||
    (params?.reservationPolicyUpdated && "Reservation policy updated.") ||
    (params?.capacityExceptionCreated && "Daily capacity exception created.") ||
    (params?.capacityExceptionUpdated && "Daily capacity exception updated.") ||
    (params?.capacityExceptionDeleted && "Daily capacity exception deleted.") ||
    (params?.scheduleUpdated && "Weekly schedule updated.") ||
    (params?.exceptionCreated && "Schedule exception created.") ||
    (params?.exceptionUpdated && "Schedule exception updated.") ||
    (params?.exceptionDeleted && "Schedule exception deleted.") ||
    (params?.holidayImported &&
      `${params.holidayImported} Iran holiday schedule exceptions imported.`) ||
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
      "holidayImported",
      "userCreated",
      "userDeleted",
      "userUpdated",
      "passwordReset",
    ],
    message: successMessage,
    variant: "success" as const,
  };
}
