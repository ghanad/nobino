"use server";

import { UserRole } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  removeTeamMember,
  updateTeam,
} from "@/lib/team-service";

import {
  getActionErrorMessage,
  getSafeAdminRedirectPath,
  redirectToPath,
} from "./shared";

const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

const updateTeamSchema = z.object({
  teamId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
});

const deleteTeamSchema = z.object({
  teamId: z.string().min(1),
});

const addTeamMemberSchema = z.object({
  teamId: z.string().min(1),
  userId: z.string().min(1),
});

const removeTeamMemberSchema = z.object({
  teamId: z.string().min(1),
  userId: z.string().min(1),
});

export async function createTeamAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = createTeamSchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    redirectToPath("/admin/teams", {
      error: "نام تیم معتبر وارد کنید (حداکثر ۱۰۰ کاراکتر).",
    });
  }

  try {
    await createTeam({ adminId: admin.id, name: parsed.data.name });
  } catch (error) {
    redirectToPath("/admin/teams", { error: getActionErrorMessage(error) });
  }

  redirectToPath("/admin/teams", { teamCreated: "1" });
}

export async function updateTeamAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const redirectPath = getSafeAdminRedirectPath(
    formData.get("redirectPath"),
    "/admin/teams",
  );
  const parsed = updateTeamSchema.safeParse({
    teamId: formData.get("teamId"),
    name: formData.get("name"),
  });

  if (!parsed.success) {
    redirectToPath(redirectPath, {
      error: "نام تیم معتبر وارد کنید (حداکثر ۱۰۰ کاراکتر).",
    });
  }

  try {
    await updateTeam({
      adminId: admin.id,
      teamId: parsed.data.teamId,
      name: parsed.data.name,
    });
  } catch (error) {
    redirectToPath(redirectPath, { error: getActionErrorMessage(error) });
  }

  redirectToPath(redirectPath, { teamUpdated: "1" });
}

export async function deleteTeamAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = deleteTeamSchema.safeParse({
    teamId: formData.get("teamId"),
  });

  if (!parsed.success) {
    redirectToPath("/admin/teams", { error: "تیم معتبری انتخاب نشده است." });
  }

  try {
    await deleteTeam({ adminId: admin.id, teamId: parsed.data.teamId });
  } catch (error) {
    redirectToPath("/admin/teams", { error: getActionErrorMessage(error) });
  }

  redirectToPath("/admin/teams", { teamDeleted: "1" });
}

export async function addTeamMemberAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const redirectPath = getSafeAdminRedirectPath(
    formData.get("redirectPath"),
    "/admin/teams",
  );
  const parsed = addTeamMemberSchema.safeParse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
  });

  if (!parsed.success) {
    redirectToPath(redirectPath, { error: "کاربر معتبری انتخاب نشده است." });
  }

  try {
    await addTeamMember({
      adminId: admin.id,
      teamId: parsed.data.teamId,
      userId: parsed.data.userId,
    });
  } catch (error) {
    redirectToPath(redirectPath, { error: getActionErrorMessage(error) });
  }

  redirectToPath(redirectPath, { memberAdded: "1" });
}

export async function removeTeamMemberAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const redirectPath = getSafeAdminRedirectPath(
    formData.get("redirectPath"),
    "/admin/teams",
  );
  const parsed = removeTeamMemberSchema.safeParse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
  });

  if (!parsed.success) {
    redirectToPath(redirectPath, { error: "عضو معتبری انتخاب نشده است." });
  }

  try {
    await removeTeamMember({
      adminId: admin.id,
      teamId: parsed.data.teamId,
      userId: parsed.data.userId,
    });
  } catch (error) {
    redirectToPath(redirectPath, { error: getActionErrorMessage(error) });
  }

  redirectToPath(redirectPath, { memberRemoved: "1" });
}
