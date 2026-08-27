"use server";

import { UserRole } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import {
  createManagedUser,
  deleteManagedUser,
  resetManagedUserPassword,
  updateManagedUser,
} from "@/lib/user-management-service";

import {
  checkboxToBoolean,
  getActionErrorMessage,
  getSafeAdminRedirectPath,
  redirectToPath,
} from "./shared";

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  role: z.nativeEnum(UserRole),
  password: z.string().min(8).max(200),
});

const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  role: z.nativeEnum(UserRole),
  active: z.coerce.boolean(),
  canViewLunchReport: z.coerce.boolean(),
  canCreateSurveys: z.coerce.boolean(),
});

const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(8).max(200),
});

const deleteUserSchema = z.object({
  userId: z.string().min(1),
});

export async function createUserAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const errorRedirectPath = getSafeAdminRedirectPath(
    formData.get("errorRedirectPath"),
    "/admin/users",
  );
  const successRedirectPath = getSafeAdminRedirectPath(
    formData.get("successRedirectPath"),
    "/admin/users",
  );
  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirectToPath(errorRedirectPath, {
      error: "Enter a valid user name, email, role, and temporary password.",
    });
  }

  try {
    await createManagedUser({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToPath(errorRedirectPath, { error: getActionErrorMessage(error) });
  }

  redirectToPath(successRedirectPath, { userCreated: "1" });
}

export async function updateUserAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const redirectPath = getSafeAdminRedirectPath(
    formData.get("redirectPath"),
    "/admin/users",
  );
  const parsed = updateUserSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
    role: formData.get("role"),
    active: checkboxToBoolean(formData.get("active")),
    canViewLunchReport: checkboxToBoolean(formData.get("canViewLunchReport")),
    canCreateSurveys: checkboxToBoolean(formData.get("canCreateSurveys")),
  });

  if (!parsed.success) {
    redirectToPath(redirectPath, { error: "Enter valid user details." });
  }

  try {
    await updateManagedUser({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToPath(redirectPath, { error: getActionErrorMessage(error) });
  }

  redirectToPath(redirectPath, { userUpdated: "1" });
}

export async function resetUserPasswordAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const redirectPath = getSafeAdminRedirectPath(
    formData.get("redirectPath"),
    "/admin/users",
  );
  const parsed = resetPasswordSchema.safeParse({
    userId: formData.get("userId"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirectToPath(redirectPath, {
      error: "Temporary password must be at least 8 characters.",
    });
  }

  try {
    await resetManagedUserPassword({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToPath(redirectPath, { error: getActionErrorMessage(error) });
  }

  redirectToPath(redirectPath, { passwordReset: "1" });
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const redirectPath = getSafeAdminRedirectPath(
    formData.get("redirectPath"),
    "/admin/users",
  );
  const parsed = deleteUserSchema.safeParse({
    userId: formData.get("userId"),
  });

  if (!parsed.success) {
    redirectToPath(redirectPath, { error: "Choose a valid user to delete." });
  }

  try {
    await deleteManagedUser({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToPath(redirectPath, { error: getActionErrorMessage(error) });
  }

  redirectToPath("/admin/users", { userDeleted: "1" });
}
