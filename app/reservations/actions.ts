"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import { CapacityUnavailableError } from "@/lib/capacity-service";
import {
  buildLocalDateAtHourFromJalali,
  formatJalaliDateParam,
  isValidJalaliDateParam,
} from "@/lib/jalali-date";
import {
  cancelReservationByUser,
  createReservationRequest,
  ReservationTransitionError,
} from "@/lib/reservation-service";
import { ReservationTimeRangeError } from "@/lib/schedule";

const reservationFormSchema = z.object({
  resourcePoolId: z.string().min(1),
  date: z.string().refine(isValidJalaliDateParam),
  startHour: z.coerce.number().int().min(0).max(23),
  endHour: z.coerce.number().int().min(1).max(23),
  reason: z.string().trim().max(500).optional(),
});

const reservationIdSchema = z.object({
  reservationId: z.string().min(1),
});

function redirectWithError(message: string, date?: string): never {
  const params = new URLSearchParams({ error: message });

  if (date) {
    params.set("date", date);
  }

  redirect(`/reservations?${params.toString()}`);
}

function redirectToReservations(params: Record<string, string | undefined>): never {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  redirect(`/reservations?${searchParams.toString()}`);
}

function getActionErrorMessage(error: unknown): string {
  if (
    error instanceof ReservationTransitionError ||
    error instanceof CapacityUnavailableError ||
    error instanceof ReservationTimeRangeError
  ) {
    return error.message;
  }

  throw error;
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
    redirectWithError(getActionErrorMessage(error), dateParam);
  }

  redirect(`/reservations?created=1&date=${dateParam}`);
}

export async function cancelReservationByUserAction(
  formData: FormData,
): Promise<void> {
  const user = await requireCurrentUser();
  const parsed = reservationIdSchema.safeParse({
    reservationId: formData.get("reservationId"),
  });

  if (!parsed.success) {
    redirectToReservations({ error: "Choose a valid reservation to cancel." });
  }

  try {
    await cancelReservationByUser({
      reservationId: parsed.data.reservationId,
      userId: user.id,
    });
  } catch (error) {
    redirectToReservations({ error: getActionErrorMessage(error) });
  }

  redirectToReservations({ cancelled: "1" });
}
