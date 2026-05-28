import { UserRole } from "@prisma/client";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

import { UrlToast } from "@/components/ui/url-toast";

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

export function getUserManagementToast(params?: {
  error?: string;
  passwordReset?: string;
  userCreated?: string;
  userUpdated?: string;
}) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  const successMessage =
    (params?.userCreated && "کاربر ساخته شد.") ||
    (params?.userUpdated && "اطلاعات کاربر ذخیره شد.") ||
    (params?.passwordReset && "رمز موقت تنظیم شد.");

  return successMessage
    ? {
        consumeKeys: ["userCreated", "userUpdated", "passwordReset"],
        message: successMessage,
        variant: "success" as const,
      }
    : null;
}

export function UserManagementToast({
  params,
}: {
  params?: {
    error?: string;
    passwordReset?: string;
    userCreated?: string;
    userUpdated?: string;
  };
}) {
  const toast = getUserManagementToast(params);

  return toast ? <UrlToast {...toast} /> : null;
}

export function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <label className="text-sm font-medium" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

export function TextInput(
  props: InputHTMLAttributes<HTMLInputElement>,
) {
  return (
    <input
      {...props}
      className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
    />
  );
}

export function SelectInput(
  props: SelectHTMLAttributes<HTMLSelectElement>,
) {
  return (
    <select
      {...props}
      className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

export function UserRoleOptions() {
  return (
    <>
      <option value={UserRole.USER}>کاربر</option>
      <option value={UserRole.MANAGER}>مدیر</option>
      <option value={UserRole.ADMIN}>ادمین</option>
    </>
  );
}
