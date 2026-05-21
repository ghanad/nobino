"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { CapacityUnavailableError } from "@/lib/capacity-service";
import { requireCurrentUser } from "@/lib/auth";
import {
  buildLocalDateAtHourFromJalali,
  formatJalaliDateParam,
  isValidJalaliDateParam,
} from "@/lib/jalali-date";
import { createReservationRequest } from "@/lib/reservation-service";
import { ReservationTimeRangeError } from "@/lib/schedule";

const reservationFormSchema = z.object({
  resourcePoolId: z.string().min(1),
  date: z.string().refine(isValidJalaliDateParam),
  startHour: z.coerce.number().int().min(0).max(23),
  endHour: z.coerce.number().int().min(1).max(23),
  reason: z.string().trim().max(500).optional(),
});

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
    redirectWithError("Enter a valid Jalali date, start hour, and end hour.");
  }

  const dateParam = formatJalaliDateParam(
    buildLocalDateAtHourFromJalali(parsed.data.date, 0),
  );

  try {
    await createReservationRequest({
      userId: user.id,
      resourcePoolId: parsed.data.resourcePoolId,
      startAt: buildLocalDateAtHourFromJalali(
        parsed.data.date,
        parsed.data.startHour,
      ),
      endAt: buildLocalDateAtHourFromJalali(parsed.data.date, parsed.data.endHour),
      reason: parsed.data.reason,
    });
  } catch (error) {
    if (
      error instanceof ReservationTimeRangeError ||
      error instanceof CapacityUnavailableError
    ) {
      redirectWithError(error.message, dateParam);
    }

    throw error;
  }

  redirect(`/reservations?created=1&date=${dateParam}`);
}
