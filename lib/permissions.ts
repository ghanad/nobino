import type { UserRole } from "@prisma/client";

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
