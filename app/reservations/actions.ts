"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { CapacityUnavailableError } from "@/lib/capacity-service";
import { requireCurrentUser } from "@/lib/auth";
import { createReservationRequest } from "@/lib/reservation-service";
import { ReservationTimeRangeError } from "@/lib/schedule";

function isValidCalendarDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

const reservationFormSchema = z.object({
  resourcePoolId: z.string().min(1),
  date: z.string().refine(isValidCalendarDateString),
  startHour: z.coerce.number().int().min(0).max(23),
  endHour: z.coerce.number().int().min(1).max(23),
  reason: z.string().trim().max(500).optional(),
});

function buildLocalDateAtHour(dateValue: string, hour: number): Date {
  const [year, month, day] = dateValue.split("-").map(Number);

  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

function redirectWithError(message: string, date?: string): never {
  const params = new URLSearchParams({ error: message });

  if (date) {
    params.set("date", date);
  }

  redirect(`/reservations?${params.toString()}`);
}

export async function createReservationAction(
  formData: FormData,
): Promise<void> {
  const user = await requireCurrentUser();
  const parsed = reservationFormSchema.safeParse({
    resourcePoolId: formData.get("resourcePoolId"),
    date: formData.get("date"),
    startHour: formData.get("startHour"),
    endHour: formData.get("endHour"),
    reason: formData.get("reason") || undefined,
  });

  if (!parsed.success) {
    redirectWithError("Enter a valid date, start hour, and end hour.");
  }

  try {
    await createReservationRequest({
      userId: user.id,
      resourcePoolId: parsed.data.resourcePoolId,
      startAt: buildLocalDateAtHour(parsed.data.date, parsed.data.startHour),
      endAt: buildLocalDateAtHour(parsed.data.date, parsed.data.endHour),
      reason: parsed.data.reason,
    });
  } catch (error) {
    if (
      error instanceof ReservationTimeRangeError ||
      error instanceof CapacityUnavailableError
    ) {
      redirectWithError(error.message, parsed.data.date);
    }

    throw error;
  }

  redirect(`/reservations?created=1&date=${parsed.data.date}`);
}
