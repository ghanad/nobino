"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import {
  buildLocalDateAtHourFromJalali,
  isValidJalaliDateParam,
} from "@/lib/jalali-date";
import {
  cancelLunchReservationByUser,
  createLunchReservation,
  LunchReservationError,
  updateLunchReservationLocation,
} from "@/lib/lunch-service";

const lunchReservationSchema = z.object({
  date: z.string().refine(isValidJalaliDateParam),
  locationId: z.string().min(1),
});

const updateLunchReservationSchema = lunchReservationSchema.extend({
  reservationId: z.string().min(1),
});

const cancelLunchReservationSchema = z.object({
  reservationId: z.string().min(1),
});

function redirectToLunch(params: Record<string, string | undefined>): never {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();

  redirect(query ? `/lunch?${query}` : "/lunch");
}

function getActionErrorMessage(error: unknown): string {
  if (error instanceof LunchReservationError) {
    return error.message;
  }

  throw error;
}

export async function createLunchReservationAction(
  formData: FormData,
): Promise<void> {
  const user = await requireCurrentUser();
  const parsed = lunchReservationSchema.safeParse({
    date: formData.get("date"),
    locationId: formData.get("locationId"),
  });

  if (!parsed.success) {
    redirectToLunch({ error: "تاریخ یا ساختمان معتبر نیست." });
  }

  try {
    await createLunchReservation({
      userId: user.id,
      locationId: parsed.data.locationId,
      date: buildLocalDateAtHourFromJalali(parsed.data.date, 0),
    });
  } catch (error) {
    redirectToLunch({ error: getActionErrorMessage(error) });
  }

  redirectToLunch({ reserved: "1" });
}

export async function updateLunchReservationAction(
  formData: FormData,
): Promise<void> {
  const user = await requireCurrentUser();
  const parsed = updateLunchReservationSchema.safeParse({
    reservationId: formData.get("reservationId"),
    date: formData.get("date"),
    locationId: formData.get("locationId"),
  });

  if (!parsed.success) {
    redirectToLunch({ error: "رزرو یا ساختمان معتبر نیست." });
  }

  try {
    await updateLunchReservationLocation({
      reservationId: parsed.data.reservationId,
      userId: user.id,
      locationId: parsed.data.locationId,
    });
  } catch (error) {
    redirectToLunch({ error: getActionErrorMessage(error) });
  }

  redirectToLunch({ updated: "1" });
}

export async function cancelLunchReservationAction(
  formData: FormData,
): Promise<void> {
  const user = await requireCurrentUser();
  const parsed = cancelLunchReservationSchema.safeParse({
    reservationId: formData.get("reservationId"),
  });

  if (!parsed.success) {
    redirectToLunch({ error: "رزرو معتبر نیست." });
  }

  try {
    await cancelLunchReservationByUser({
      reservationId: parsed.data.reservationId,
      userId: user.id,
    });
  } catch (error) {
    redirectToLunch({ error: getActionErrorMessage(error) });
  }

  redirectToLunch({ cancelled: "1" });
}
