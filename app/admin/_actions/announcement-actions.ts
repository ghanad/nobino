"use server";

import {
  AnnouncementAudience,
  AnnouncementSeverity,
  UserRole,
} from "@prisma/client";
import { z } from "zod";

import {
  createAnnouncement,
  deactivateAnnouncement,
} from "@/lib/announcement-service";
import { requireRole } from "@/lib/auth";
import {
  isValidJalaliDateParam,
  parseJalaliDateParam,
} from "@/lib/jalali-date";

import {
  checkboxToBoolean,
  emptyToUndefined,
  getActionErrorMessage,
  redirectToPath,
  startOfLocalDay,
  startOfNextLocalDay,
} from "./shared";

const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1200),
  severity: z.nativeEnum(AnnouncementSeverity),
  audience: z.nativeEnum(AnnouncementAudience),
  startsAt: z.string().refine(isValidJalaliDateParam),
  endsAt: z.string().optional(),
  requiresAck: z.coerce.boolean(),
});

const deactivateAnnouncementSchema = z.object({
  announcementId: z.string().min(1),
});

export async function createAnnouncementAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = createAnnouncementSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    severity: formData.get("severity"),
    audience: formData.get("audience"),
    startsAt: formData.get("startsAt"),
    endsAt: emptyToUndefined(formData.get("endsAt")),
    requiresAck: checkboxToBoolean(formData.get("requiresAck")),
  });

  if (!parsed.success) {
    redirectToPath("/admin/announcements", {
      error: "عنوان، متن، مخاطب و تاریخ شروع معتبر وارد کنید.",
    });
  }

  const startsAt = parseJalaliDateParam(parsed.data.startsAt);
  const endsAt = parsed.data.endsAt
    ? parseJalaliDateParam(parsed.data.endsAt)
    : null;

  if (!startsAt || (parsed.data.endsAt && !endsAt)) {
    redirectToPath("/admin/announcements", {
      error: "تاریخ شروع یا پایان اعلان معتبر نیست.",
    });
  }

  try {
    await createAnnouncement({
      adminId: admin.id,
      audience: parsed.data.audience,
      body: parsed.data.body,
      endsAt: endsAt ? startOfNextLocalDay(endsAt) : null,
      requiresAck: parsed.data.requiresAck,
      severity: parsed.data.severity,
      startsAt: startOfLocalDay(startsAt),
      title: parsed.data.title,
    });
  } catch (error) {
    redirectToPath("/admin/announcements", {
      error: getActionErrorMessage(error),
    });
  }

  redirectToPath("/admin/announcements", { announcementCreated: "1" });
}

export async function deactivateAnnouncementAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = deactivateAnnouncementSchema.safeParse({
    announcementId: formData.get("announcementId"),
  });

  if (!parsed.success) {
    redirectToPath("/admin/announcements", {
      error: "اعلان معتبر انتخاب نشده است.",
    });
  }

  try {
    await deactivateAnnouncement({
      adminId: admin.id,
      announcementId: parsed.data.announcementId,
    });
  } catch (error) {
    redirectToPath("/admin/announcements", {
      error: getActionErrorMessage(error),
    });
  }

  redirectToPath("/admin/announcements", { announcementDeactivated: "1" });
}
