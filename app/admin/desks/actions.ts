"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AdminSettingsError } from "@/lib/admin-settings-service/shared";
import { requireRole } from "@/lib/auth";
import { createDesk, createOffice, deleteOffice, deleteOfficeScheduleException, updateDesk, updateDeskSettings, updateOffice, updateOfficeWeeklySchedule, upsertOfficeScheduleException } from "@/lib/desk-admin-service";
import { isValidJalaliDateParam, parseJalaliDateParam } from "@/lib/jalali-date";

const nameSchema = z.string().trim().min(1).max(100);
const idSchema = z.string().min(1);
const sortSchema = z.coerce.number().int().min(0).max(1000);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):00$/);

export type AdminDeskActionState = {
  id?: string;
  message?: string;
  ok?: boolean;
  redirectTo?: string;
};

function checked(value: FormDataEntryValue | null) { return value === "on" || value === "true"; }
function result(ok: boolean, message: string, redirectTo?: string): AdminDeskActionState {
  return { id: crypto.randomUUID(), message, ok, redirectTo };
}
function message(error: unknown) { if (error instanceof AdminSettingsError) return error.message; throw error; }
function refreshDesks() { revalidatePath("/admin/desks"); }

export async function createOfficeAction(_state: AdminDeskActionState, formData: FormData): Promise<AdminDeskActionState> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = z.object({ name: nameSchema, sortOrder: sortSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return result(false, "نام و ترتیب دفتر را معتبر وارد کنید.");
  try {
    const office = await createOffice({ adminId: admin.id, ...parsed.data });
    refreshDesks();
    return result(true, "دفتر ایجاد شد.", `/admin/desks?officeId=${encodeURIComponent(office.id)}`);
  }
  catch (error) { return result(false, message(error)); }
}

export async function updateOfficeAction(_state: AdminDeskActionState, formData: FormData): Promise<AdminDeskActionState> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = z.object({ officeId: idSchema, name: nameSchema, sortOrder: sortSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return result(false, "مشخصات دفتر معتبر نیست.");
  try { await updateOffice({ active: checked(formData.get("active")), adminId: admin.id, ...parsed.data }); }
  catch (error) { return result(false, message(error)); }
  refreshDesks();
  return result(true, "مشخصات دفتر ذخیره شد.");
}

export async function deleteOfficeAction(_state: AdminDeskActionState, formData: FormData): Promise<AdminDeskActionState> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = z.object({ officeId: idSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return result(false, "دفتر معتبر نیست.");
  try { await deleteOffice({ adminId: admin.id, officeId: parsed.data.officeId }); }
  catch (error) { return result(false, message(error)); }
  refreshDesks();
  return result(true, "دفتر و رزروهای آینده آن حذف شدند.", "/admin/desks");
}

export async function createDeskAction(_state: AdminDeskActionState, formData: FormData): Promise<AdminDeskActionState> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = z.object({ officeId: idSchema, name: nameSchema, sortOrder: sortSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return result(false, "نام و ترتیب میز را معتبر وارد کنید.");
  try { await createDesk({ adminId: admin.id, ...parsed.data }); }
  catch (error) { return result(false, message(error)); }
  refreshDesks();
  return result(true, "میز جدید اضافه شد.");
}

export async function updateDeskAction(_state: AdminDeskActionState, formData: FormData): Promise<AdminDeskActionState> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = z.object({ deskId: idSchema, name: nameSchema, officeId: idSchema, sortOrder: sortSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return result(false, "مشخصات میز معتبر نیست.");
  try { await updateDesk({ active: checked(formData.get("active")), adminId: admin.id, deskId: parsed.data.deskId, name: parsed.data.name, sortOrder: parsed.data.sortOrder }); }
  catch (error) { return result(false, message(error)); }
  refreshDesks();
  return result(true, "مشخصات میز ذخیره شد.");
}

export async function updateDeskSettingsAction(_state: AdminDeskActionState, formData: FormData): Promise<AdminDeskActionState> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = z.object({
    autoApprovalDelayHours: z.coerce.number().int().min(1).max(24),
    maxAdvanceDays: z.coerce.number().int().min(1).max(365),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return result(false, "تعداد روز یا مهلت تأیید خودکار معتبر نیست.");
  try {
    await updateDeskSettings({
      adminId: admin.id,
      autoApprovalEnabled: checked(formData.get("autoApprovalEnabled")),
      ...parsed.data,
    });
  }
  catch (error) { return result(false, message(error)); }
  refreshDesks();
  return result(true, "سیاست رزرو میز ذخیره شد.");
}

export async function updateOfficeScheduleAction(_state: AdminDeskActionState, formData: FormData): Promise<AdminDeskActionState> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = z.object({ dayOfWeek: z.coerce.number().int().min(0).max(6), endTime: timeSchema, officeId: idSchema, startTime: timeSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return result(false, "برنامه کاری معتبر نیست.");
  try { await updateOfficeWeeklySchedule({ adminId: admin.id, isWorkingDay: checked(formData.get("isWorkingDay")), ...parsed.data }); }
  catch (error) { return result(false, message(error)); }
  refreshDesks();
  return result(true, "برنامه کاری ذخیره شد.");
}

export async function upsertOfficeExceptionAction(_state: AdminDeskActionState, formData: FormData): Promise<AdminDeskActionState> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = z.object({ date: z.string().refine(isValidJalaliDateParam), officeId: idSchema, reason: z.string().trim().max(200).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return result(false, "تاریخ و اطلاعات استثنا معتبر نیست.");
  const isWorkingDay = checked(formData.get("isWorkingDay"));
  const startTime = String(formData.get("startTime") || "") || undefined;
  const endTime = String(formData.get("endTime") || "") || undefined;
  try { await upsertOfficeScheduleException({ adminId: admin.id, date: parseJalaliDateParam(parsed.data.date)!, endTime, isWorkingDay, officeId: parsed.data.officeId, reason: parsed.data.reason, startTime }); }
  catch (error) { return result(false, message(error)); }
  refreshDesks();
  return result(true, "استثنای تقویم ذخیره شد.");
}

export async function deleteOfficeExceptionAction(_state: AdminDeskActionState, formData: FormData): Promise<AdminDeskActionState> {
  const admin = await requireRole([UserRole.ADMIN]);
  const exceptionId = String(formData.get("exceptionId") || "");
  if (!exceptionId) return result(false, "استثنا معتبر نیست.");
  try { await deleteOfficeScheduleException({ adminId: admin.id, exceptionId }); }
  catch (error) { return result(false, message(error)); }
  refreshDesks();
  return result(true, "استثنا حذف شد.");
}
