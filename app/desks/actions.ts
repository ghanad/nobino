"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import { getOfficeWorkingWindowForDate } from "@/lib/desk-schedule";
import { cancelDeskReservationByUser, createDeskReservation, updateDeskReservation } from "@/lib/desk-reservation-service";
import { buildLocalDateAtHourFromJalali, formatJalaliDateParam, isValidJalaliDateParam, parseJalaliDateParam } from "@/lib/jalali-date";
import { ReservationTransitionError } from "@/lib/reservation-service";
import { ReservationTimeRangeError } from "@/lib/schedule";

const rangeSchema = z.object({
  date: z.string().refine(isValidJalaliDateParam),
  deskId: z.string().min(1),
  endHour: z.coerce.number().int().min(1).max(24),
  fullDay: z.boolean(),
  startHour: z.coerce.number().int().min(0).max(23),
});

function redirectToDesks(params: Record<string, string | undefined>): never {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  redirect(`/desks?${query.toString()}`);
}

function getError(error: unknown): string {
  if (error instanceof ReservationTransitionError || error instanceof ReservationTimeRangeError) return error.message;
  throw error;
}

async function parseRange(formData: FormData) {
  const parsed = rangeSchema.safeParse({
    date: formData.get("date"),
    deskId: formData.get("deskId"),
    endHour: formData.get("endHour") || 17,
    fullDay: formData.get("fullDay") === "on",
    startHour: formData.get("startHour") || 9,
  });
  if (!parsed.success) throw new ReservationTimeRangeError("میز، تاریخ و ساعت را معتبر وارد کنید.");
  let { endHour, startHour } = parsed.data;
  if (parsed.data.fullDay) {
    const date = parseJalaliDateParam(parsed.data.date)!;
    const desk = await import("@/lib/db").then(({ db }) => db.desk.findUnique({ where: { id: parsed.data.deskId }, select: { officeId: true } }));
    if (!desk) throw new ReservationTimeRangeError("میز پیدا نشد.");
    const window = await getOfficeWorkingWindowForDate({ date, officeId: desk.officeId });
    if (!window.startTime || !window.endTime) throw new ReservationTimeRangeError("دفتر در این روز فعال نیست.");
    startHour = Number(window.startTime.slice(0, 2));
    endHour = Number(window.endTime.slice(0, 2));
  }
  return {
    date: parsed.data.date,
    deskId: parsed.data.deskId,
    endAt: buildLocalDateAtHourFromJalali(parsed.data.date, endHour),
    startAt: buildLocalDateAtHourFromJalali(parsed.data.date, startHour),
  };
}

export async function createDeskReservationAction(formData: FormData) {
  const user = await requireCurrentUser();
  let date = typeof formData.get("date") === "string" ? String(formData.get("date")) : undefined;
  const officeId = typeof formData.get("officeId") === "string" ? String(formData.get("officeId")) : undefined;
  try {
    const range = await parseRange(formData);
    date = formatJalaliDateParam(range.startAt);
    await createDeskReservation({
      deskId: range.deskId,
      endAt: range.endAt,
      startAt: range.startAt,
      userId: user.id,
    });
  } catch (error) {
    redirectToDesks({ date, error: getError(error), officeId });
  }
  redirectToDesks({ created: "1", date, officeId });
}

export async function updateOwnDeskReservationAction(formData: FormData) {
  const user = await requireCurrentUser();
  const reservationId = String(formData.get("reservationId") || "");
  const officeId = String(formData.get("officeId") || "") || undefined;
  let date = String(formData.get("date") || "") || undefined;
  try {
    if (!reservationId) throw new ReservationTransitionError("رزرو میز معتبر نیست.");
    const range = await parseRange(formData);
    date = range.date;
    await updateDeskReservation({
      actorUserId: user.id,
      deskId: range.deskId,
      endAt: range.endAt,
      reservationId,
      startAt: range.startAt,
    });
  } catch (error) {
    redirectToDesks({ date, error: getError(error), officeId });
  }
  redirectToDesks({ date, officeId, updated: "1" });
}

export async function cancelOwnDeskReservationAction(formData: FormData) {
  const user = await requireCurrentUser();
  const reservationId = String(formData.get("reservationId") || "");
  const date = String(formData.get("date") || "") || undefined;
  const officeId = String(formData.get("officeId") || "") || undefined;
  try {
    if (!reservationId) throw new ReservationTransitionError("رزرو میز معتبر نیست.");
    await cancelDeskReservationByUser({ reservationId, userId: user.id });
  } catch (error) {
    redirectToDesks({ date, error: getError(error), officeId });
  }
  redirectToDesks({ cancelled: "1", date, officeId });
}
