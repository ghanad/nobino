import { AnnouncementError } from "@/lib/announcement-service";
import { AdminSettingsError } from "@/lib/admin-settings-service";
import { TeamError } from "@/lib/team-service";
import { UserManagementError } from "@/lib/user-management-service";
import { redirect } from "next/navigation";

export function checkboxToBoolean(value: FormDataEntryValue | null): boolean {
  return value === "on";
}

export function emptyToUndefined(
  value: FormDataEntryValue | null,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim() || undefined;
}

export function redirectToAdmin(
  params: Record<string, string | undefined>,
): never {
  const searchParams = new URLSearchParams();
  const sectionPath =
    params.tab === "capacity"
      ? "/admin/capacity"
      : params.tab === "reservation-policy"
        ? "/admin/reservation-policy"
      : params.tab === "schedule"
        ? "/admin/calendar"
        : "/admin/users";

  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "tab") {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();

  redirect(query ? `${sectionPath}?${query}` : sectionPath);
}

export function getSafeAdminRedirectPath(
  value: FormDataEntryValue | null,
  fallback: string,
): string {
  if (
    typeof value === "string" &&
    value.startsWith("/admin") &&
    !value.startsWith("//")
  ) {
    return value;
  }

  return fallback;
}

export function redirectToPath(
  path: string,
  params: Record<string, string | undefined>,
): never {
  const [pathname, existingQuery = ""] = path.split("?");
  const searchParams = new URLSearchParams(existingQuery);

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();

  redirect(query ? `${pathname}?${query}` : pathname);
}

export function getActionErrorMessage(error: unknown): string {
  if (
    error instanceof AdminSettingsError ||
    error instanceof AnnouncementError ||
    error instanceof UserManagementError ||
    error instanceof TeamError
  ) {
    return error.message;
  }

  throw error;
}

export function startOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
}

export function startOfNextLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
    0,
    0,
    0,
    0,
  );
}
