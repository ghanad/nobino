import "server-only";

import { Prisma, UserRole } from "@prisma/client";

import { db } from "@/lib/db";

export type DbClient = typeof db | Prisma.TransactionClient;

export class AdminSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSettingsError";
  }
}

const BALE_CHAT_ID_PATTERN = /^-?\d+$/;
const BALE_CHAT_ID_MAX_LENGTH = 100;

export function normalizeBaleChatId(chatId: string | null | undefined): string | null {
  if (typeof chatId === "string" && chatId.trim().length === 0) {
    throw new AdminSettingsError("شناسه گفت‌وگوی بله معتبر نیست.");
  }

  const value = chatId?.trim() || null;

  if (!value) {
    return null;
  }

  if (value.length > BALE_CHAT_ID_MAX_LENGTH || !BALE_CHAT_ID_PATTERN.test(value)) {
    throw new AdminSettingsError("شناسه گفت‌وگوی بله معتبر نیست.");
  }

  return value;
}

export async function assertAdmin(adminId: string, client: DbClient = db) {
  const user = await client.user.findUnique({
    where: { id: adminId },
    select: { active: true, role: true },
  });

  if (!user?.active || user.role !== UserRole.ADMIN) {
    throw new AdminSettingsError("Only admins can change system settings.");
  }
}
