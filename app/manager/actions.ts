"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { CapacityUnavailableError } from "@/lib/capacity-service";
import { requireCurrentUser } from "@/lib/auth";
import {
  buildLocalDateAtHourFromJalali,
  isValidJalaliDateParam,
} from "@/lib/jalali-date";
import {
  approveReservation,
  proposeAlternative,
  rejectReservation,
  ReservationTransitionError,
} from "@/lib/reservation-service";
import { ReservationTimeRangeError } from "@/lib/schedule";

const reservationIdSchema = z.object({
  reservationId: z.string().min(1),
  date: z.string().optional(),
});

const rejectSchema = reservationIdSchema.extend({
  rejectionReason: z.string().trim().max(500).optional(),
});

const alternativeSchema = reservationIdSchema.extend({
  proposedDate: z.string().refine(isValidJalaliDateParam),
  proposedStartHour: z.coerce.number().int().min(0).max(23),
  proposedEndHour: z.coerce.number().int().min(1).max(23),
});

function redirectToQueue(params: Record<string, string | undefined>): never {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  redirect(`/manager?${searchParams.toString()}`);
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

export async function approveReservationAction(
  formData: FormData,
): Promise<void> {
  const user = await requireCurrentUser();
  const parsed = reservationIdSchema.safeParse({
    reservationId: formData.get("reservationId"),
    date: formData.get("date") || undefined,
  });

  if (!parsed.success) {
    redirectToQueue({ error: "Choose a valid reservation to approve." });
  }

  try {
    await approveReservation({
      reservationId: parsed.data.reservationId,
      managerId: user.id,
    });
  } catch (error) {
    redirectToQueue({
      date: parsed.data.date,
      error: getActionErrorMessage(error),
    });
  }

  redirectToQueue({ date: parsed.data.date, approved: "1" });
}

export async function rejectReservationAction(
  formData: FormData,
): Promise<void> {
  const user = await requireCurrentUser();
  const parsed = rejectSchema.safeParse({
    reservationId: formData.get("reservationId"),
    rejectionReason: formData.get("rejectionReason") || undefined,
    date: formData.get("date") || undefined,
  });

  if (!parsed.success) {
    redirectToQueue({ error: "Choose a valid reservation to reject." });
  }

  try {
    await rejectReservation({
      reservationId: parsed.data.reservationId,
      managerId: user.id,
      rejectionReason: parsed.data.rejectionReason,
    });
  } catch (error) {
    redirectToQueue({
      date: parsed.data.date,
      error: getActionErrorMessage(error),
    });
  }

  redirectToQueue({ date: parsed.data.date, rejected: "1" });
}

export async function proposeAlternativeAction(
  formData: FormData,
): Promise<void> {
  const user = await requireCurrentUser();
  const parsed = alternativeSchema.safeParse({
    reservationId: formData.get("reservationId"),
    proposedDate: formData.get("proposedDate"),
    proposedStartHour: formData.get("proposedStartHour"),
    proposedEndHour: formData.get("proposedEndHour"),
    date: formData.get("date") || undefined,
  });

  if (!parsed.success) {
    redirectToQueue({ error: "Enter a valid Jalali alternative date and hours." });
  }

  try {
    await proposeAlternative({
      reservationId: parsed.data.reservationId,
      managerId: user.id,
      proposedStartAt: buildLocalDateAtHourFromJalali(
        parsed.data.proposedDate,
        parsed.data.proposedStartHour,
      ),
      proposedEndAt: buildLocalDateAtHourFromJalali(
        parsed.data.proposedDate,
        parsed.data.proposedEndHour,
      ),
    });
  } catch (error) {
    redirectToQueue({
      date: parsed.data.date,
      error: getActionErrorMessage(error),
    });
  }

  redirectToQueue({ date: parsed.data.date, alternative: "1" });
}
