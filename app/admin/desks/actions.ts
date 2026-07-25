"use server";

import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { z } from "zod";

import { AdminSettingsError } from "@/lib/admin-settings-service/shared";
import { requireRole } from "@/lib/auth";
import { createDesk, createOffice, deleteOffice, deleteOfficeScheduleException, updateDesk, updateDeskSettings, updateOffice, updateOfficeWeeklySchedule, upsertOfficeScheduleException } from "@/lib/desk-admin-service";
import { isValidJalaliDateParam, parseJalaliDateParam } from "@/lib/jalali-date";

const nameSchema = z.string().trim().min(1).max(100);
const idSchema = z.string().min(1);
const sortSchema = z.coerce.number().int().min(0).max(1000);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):00$/);

function checked(value: FormDataEntryValue | null) { return value === "on" || value === "true"; }
function go(params: Record<string, string | undefined>): never {
  const query = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  redirect(`/admin/desks?${query.toString()}`);
}
function message(error: unknown) { if (error instanceof AdminSettingsError) return error.message; throw error; }

export async function createOfficeAction(formData: FormData) {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = z.object({ name: nameSchema, sortOrder: sortSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) go({ error: "نام و ترتیب دفتر را معتبر وارد کنید." });
  try { const office = await createOffice({ adminId: admin.id, ...parsed.data }); go({ officeCreated: "1", officeId: office.id }); }
  catch (error) { go({ error: message(error) }); }
}

export async function updateOfficeAction(formData: FormData) {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = z.object({ officeId: idSchema, name: nameSchema, sortOrder: sortSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) go({ error: "مشخصات دفتر معتبر نیست." });
  try { await updateOffice({ active: checked(formData.get("active")), adminId: admin.id, ...parsed.data }); }
  catch (error) { go({ error: message(error), officeId: parsed.data.officeId }); }
  go({ officeId: parsed.data.officeId, officeUpdated: "1" });
}

export async function deleteOfficeAction(formData: FormData) {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = z.object({ officeId: idSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) go({ error: "دفتر معتبر نیست." });
  try { await deleteOffice({ adminId: admin.id, officeId: parsed.data.officeId }); }
  catch (error) { go({ error: message(error), officeId: parsed.data.officeId }); }
  go({ officeDeleted: "1" });
}

export async function createDeskAction(formData: FormData) {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = z.object({ officeId: idSchema, name: nameSchema, sortOrder: sortSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) go({ error: "نام و ترتیب میز را معتبر وارد کنید." });
  try { await createDesk({ adminId: admin.id, ...parsed.data }); }
  catch (error) { go({ error: message(error), officeId: parsed.data.officeId }); }
  go({ deskCreated: "1", officeId: parsed.data.officeId });
}

export async function updateDeskAction(formData: FormData) {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = z.object({ deskId: idSchema, name: nameSchema, officeId: idSchema, sortOrder: sortSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) go({ error: "مشخصات میز معتبر نیست." });
  try { await updateDesk({ active: checked(formData.get("active")), adminId: admin.id, deskId: parsed.data.deskId, name: parsed.data.name, sortOrder: parsed.data.sortOrder }); }
  catch (error) { go({ error: message(error), officeId: parsed.data.officeId }); }
  go({ deskUpdated: "1", officeId: parsed.data.officeId });
}

export async function updateDeskSettingsAction(formData: FormData) {
  const admin = await requireRole([UserRole.ADMIN]);
  const officeId = String(formData.get("officeId") || "") || undefined;
  const parsed = z.object({
    autoApprovalDelayHours: z.coerce.number().int().min(1).max(24),
    maxAdvanceDays: z.coerce.number().int().min(1).max(365),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) go({ error: "تعداد روز یا مهلت تأیید خودکار معتبر نیست.", officeId, view: "policy" });
  try {
    await updateDeskSettings({
      adminId: admin.id,
      autoApprovalEnabled: checked(formData.get("autoApprovalEnabled")),
      ...parsed.data,
    });
  }
  catch (error) { go({ error: message(error), officeId, view: "policy" }); }
  go({ officeId, settingsUpdated: "1", view: "policy" });
}

export async function updateOfficeScheduleAction(formData: FormData) {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = z.object({ dayOfWeek: z.coerce.number().int().min(0).max(6), endTime: timeSchema, officeId: idSchema, startTime: timeSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) go({ error: "برنامه کاری معتبر نیست.", officeId: String(formData.get("officeId") || ""), view: "schedule" });
  try { await updateOfficeWeeklySchedule({ adminId: admin.id, isWorkingDay: checked(formData.get("isWorkingDay")), ...parsed.data }); }
  catch (error) { go({ error: message(error), officeId: parsed.data.officeId, view: "schedule" }); }
  go({ officeId: parsed.data.officeId, scheduleUpdated: "1", view: "schedule" });
}

export async function upsertOfficeExceptionAction(formData: FormData) {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = z.object({ date: z.string().refine(isValidJalaliDateParam), officeId: idSchema, reason: z.string().trim().max(200).optional() }).safeParse(Object.fromEntries(formData));
  const officeId = String(formData.get("officeId") || "");
  if (!parsed.success) go({ error: "تاریخ و اطلاعات استثنا معتبر نیست.", officeId, view: "exceptions" });
  const isWorkingDay = checked(formData.get("isWorkingDay"));
  const startTime = String(formData.get("startTime") || "") || undefined;
  const endTime = String(formData.get("endTime") || "") || undefined;
  try { await upsertOfficeScheduleException({ adminId: admin.id, date: parseJalaliDateParam(parsed.data.date)!, endTime, isWorkingDay, officeId: parsed.data.officeId, reason: parsed.data.reason, startTime }); }
  catch (error) { go({ error: message(error), officeId, view: "exceptions" }); }
  go({ exceptionSaved: "1", officeId, view: "exceptions" });
}

export async function deleteOfficeExceptionAction(formData: FormData) {
  const admin = await requireRole([UserRole.ADMIN]);
  const exceptionId = String(formData.get("exceptionId") || ""); const officeId = String(formData.get("officeId") || "");
  if (!exceptionId) go({ error: "استثنا معتبر نیست.", officeId, view: "exceptions" });
  try { await deleteOfficeScheduleException({ adminId: admin.id, exceptionId }); }
  catch (error) { go({ error: message(error), officeId, view: "exceptions" }); }
  go({ exceptionDeleted: "1", officeId, view: "exceptions" });
}
