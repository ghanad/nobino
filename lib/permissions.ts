import type { UserRole } from "@prisma/client";

import type { CurrentUser } from "@/lib/auth";

export function isManagerOrAdmin(role: UserRole): boolean {
  return role === "MANAGER" || role === "ADMIN";
}

export function isAdmin(role: UserRole): boolean {
  return role === "ADMIN";
}

export function canAccessManagerArea(role: UserRole): boolean {
  return isManagerOrAdmin(role);
}

export function canAccessAdminArea(role: UserRole): boolean {
  return isAdmin(role);
}

export function canManageWiki(role: UserRole): boolean {
  return isAdmin(role);
}

export function canAccessLunchReport(
  user: Pick<CurrentUser, "role" | "canViewLunchReport">,
): boolean {
  return isManagerOrAdmin(user.role) || user.canViewLunchReport;
}

export function canCreateSurvey(
  user: Pick<CurrentUser, "role" | "active" | "canCreateSurveys">,
): boolean {
  if (!user.active) {
    return false;
  }

  return user.role === "ADMIN" || user.canCreateSurveys;
}
