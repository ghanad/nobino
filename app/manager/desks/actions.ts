"use server";

import { revalidatePath } from "next/cache";
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

export type ManagerDeskActionState = {
  id?: string;
  message?: string;
  mutation?: {
    deskId?: string;
    endAt?: string;
    reservationId: string;
    startAt?: string;
    type: "approve" | "remove" | "update";
  };
  ok?: boolean;
};

function result(
  ok: boolean,
  message: string,
  mutation?: ManagerDeskActionState["mutation"],
): ManagerDeskActionState {
  return { id: crypto.randomUUID(), message, mutation, ok };
}
function message(error: unknown) {
  if (error instanceof ReservationTransitionError || error instanceof ReservationTimeRangeError) return error.message;
  throw error;
}

export async function updateDeskReservationByManagerAction(
  _state: ManagerDeskActionState,
  formData: FormData,
): Promise<ManagerDeskActionState> {
  const manager = await requireCurrentUser();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return result(false, "میز، تاریخ و ساعت را معتبر وارد کنید.");
  let updated;
  try {
    updated = await updateDeskReservation({
      actorUserId: manager.id, deskId: parsed.data.deskId,
      endAt: buildLocalDateAtHourFromJalali(parsed.data.date, parsed.data.endHour),
      reservationId: parsed.data.reservationId,
      startAt: buildLocalDateAtHourFromJalali(parsed.data.date, parsed.data.startHour),
    });
  } catch (error) { return result(false, message(error)); }
  revalidatePath("/desks");
  return result(true, "رزرو میز تغییر کرد.", {
    deskId: updated.deskId,
    endAt: updated.endAt.toISOString(),
    reservationId: updated.id,
    startAt: updated.startAt.toISOString(),
    type: "update",
  });
}

export async function cancelDeskReservationByManagerAction(
  _state: ManagerDeskActionState,
  formData: FormData,
): Promise<ManagerDeskActionState> {
  const manager = await requireCurrentUser();
  const reservationId = String(formData.get("reservationId") || "");
  if (!reservationId) return result(false, "رزرو میز معتبر نیست.");
  try { await cancelDeskReservationByManager({ managerId: manager.id, reservationId }); }
  catch (error) { return result(false, message(error)); }
  revalidatePath("/desks");
  return result(true, "رزرو میز لغو شد.", { reservationId, type: "remove" });
}

export async function approveDeskReservationAction(
  _state: ManagerDeskActionState,
  formData: FormData,
): Promise<ManagerDeskActionState> {
  const manager = await requireCurrentUser();
  const reservationId = String(formData.get("reservationId") || "");
  if (!reservationId) return result(false, "درخواست رزرو میز معتبر نیست.");
  try { await approveDeskReservation({ managerId: manager.id, reservationId }); }
  catch (error) { return result(false, message(error)); }
  revalidatePath("/desks");
  return result(true, "درخواست رزرو میز تأیید شد.", { reservationId, type: "approve" });
}

export async function rejectDeskReservationAction(
  _state: ManagerDeskActionState,
  formData: FormData,
): Promise<ManagerDeskActionState> {
  const manager = await requireCurrentUser();
  const reservationId = String(formData.get("reservationId") || "");
  if (!reservationId) return result(false, "درخواست رزرو میز معتبر نیست.");
  try { await rejectDeskReservation({ managerId: manager.id, reservationId }); }
  catch (error) { return result(false, message(error)); }
  revalidatePath("/desks");
  return result(true, "درخواست رزرو میز رد شد.", { reservationId, type: "remove" });
}
