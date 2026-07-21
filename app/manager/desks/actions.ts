"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import { approveDeskReservation, cancelDeskReservationByManager, rejectDeskReservation, updateDeskReservation } from "@/lib/desk-reservation-service";
import { buildLocalDateAtHourFromJalali, isValidJalaliDateParam } from "@/lib/jalali-date";
import { ReservationTransitionError } from "@/lib/reservation-service";
import { ReservationTimeRangeError } from "@/lib/schedule";

const updateSchema = z.object({
  date: z.string().refine(isValidJalaliDateParam), deskId: z.string().min(1),
  endHour: z.coerce.number().int().min(1).max(24), reservationId: z.string().min(1),
  startHour: z.coerce.number().int().min(0).max(23),
});

function go(params: Record<string, string>): never {
  const query = new URLSearchParams(params);
  redirect(`/manager/desks?${query.toString()}`);
}
function message(error: unknown) {
  if (error instanceof ReservationTransitionError || error instanceof ReservationTimeRangeError) return error.message;
  throw error;
}

export async function updateDeskReservationByManagerAction(formData: FormData) {
  const manager = await requireCurrentUser();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) go({ error: "میز، تاریخ و ساعت را معتبر وارد کنید." });
  try {
    await updateDeskReservation({
      actorUserId: manager.id, deskId: parsed.data.deskId,
      endAt: buildLocalDateAtHourFromJalali(parsed.data.date, parsed.data.endHour),
      reservationId: parsed.data.reservationId,
      startAt: buildLocalDateAtHourFromJalali(parsed.data.date, parsed.data.startHour),
    });
  } catch (error) { go({ error: message(error) }); }
  revalidatePath("/desks");
  go({ updated: "1" });
}

export async function cancelDeskReservationByManagerAction(formData: FormData) {
  const manager = await requireCurrentUser();
  const reservationId = String(formData.get("reservationId") || "");
  if (!reservationId) go({ error: "رزرو میز معتبر نیست." });
  try { await cancelDeskReservationByManager({ managerId: manager.id, reservationId }); }
  catch (error) { go({ error: message(error) }); }
  revalidatePath("/desks");
  go({ cancelled: "1" });
}

export async function approveDeskReservationAction(formData: FormData) {
  const manager = await requireCurrentUser();
  const reservationId = String(formData.get("reservationId") || "");
  if (!reservationId) go({ error: "درخواست رزرو میز معتبر نیست." });
  try { await approveDeskReservation({ managerId: manager.id, reservationId }); }
  catch (error) { go({ error: message(error) }); }
  revalidatePath("/desks");
  go({ approved: "1" });
}

export async function rejectDeskReservationAction(formData: FormData) {
  const manager = await requireCurrentUser();
  const reservationId = String(formData.get("reservationId") || "");
  if (!reservationId) go({ error: "درخواست رزرو میز معتبر نیست." });
  try { await rejectDeskReservation({ managerId: manager.id, reservationId }); }
  catch (error) { go({ error: message(error) }); }
  revalidatePath("/desks");
  go({ rejected: "1" });
}
