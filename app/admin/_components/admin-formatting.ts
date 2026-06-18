import { UserRole } from "@prisma/client";

export const DAY_LABELS: Record<number, string> = {
  0: "یک شنبه",
  1: "دو شنبه",
  2: "سه شنبه",
  3: "چهار شنبه",
  4: "پنج شنبه",
  5: "جمعه",
  6: "شنبه",
};

export const PERSIAN_WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR");

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  USER: "کاربر",
  MANAGER: "مدیر",
  ADMIN: "ادمین",
};

export const USER_ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  USER: "ثبت و پیگیری رزروهای خودش",
  MANAGER: "بررسی، تایید و رد درخواست‌ها",
  ADMIN: "دسترسی کامل به تنظیمات و کاربران",
};

export function formatPersianNumber(value: number): string {
  return PERSIAN_NUMBER_FORMATTER.format(value);
}

export function formatPersianTime(value: string | null | undefined): string {
  if (!value) {
    return "نامشخص";
  }

  const [hour = "0", minute = "0"] = value.split(":");

  return `${formatPersianNumber(Number(hour)).padStart(2, "۰")}:${formatPersianNumber(
    Number(minute),
  ).padStart(2, "۰")}`;
}

export function formatWorkingWindow(input: {
  isWorkingDay: boolean;
  startTime: string | null;
  endTime: string | null;
}): string {
  if (!input.isWorkingDay) {
    return "تعطیل";
  }

  return `${formatPersianTime(input.startTime)} تا ${formatPersianTime(input.endTime)}`;
}

export function getUserRoleBadgeClass(role: UserRole): string {
  if (role === UserRole.ADMIN) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (role === UserRole.MANAGER) {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}
