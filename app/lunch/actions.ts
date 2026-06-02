"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
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

export type LunchActionState = {
  message: string;
  mutation?:
    | {
        dateParam: string;
        reservation: {
          id: string;
          locationId: string;
          locationName: string;
        };
        type: "create" | "update";
      }
    | {
        reservationId: string;
        type: "cancel";
      };
  status: "error" | "idle" | "success";
};

function getActionErrorMessage(error: unknown): string {
  if (error instanceof LunchReservationError) {
    return error.message;
  }

  throw error;
}

function createActionState(
  status: LunchActionState["status"],
  message: string,
  mutation?: LunchActionState["mutation"],
): LunchActionState {
  return { message, mutation, status };
}

async function getLocationName(locationId: string): Promise<string> {
  const location = await db.lunchLocation.findUnique({
    where: { id: locationId },
    select: { name: true },
  });

  return location?.name ?? "";
}

export async function createLunchReservationAction(
  _previousState: LunchActionState,
  formData: FormData,
): Promise<LunchActionState> {
  const user = await requireCurrentUser();
  const parsed = lunchReservationSchema.safeParse({
    date: formData.get("date"),
    locationId: formData.get("locationId"),
  });

  if (!parsed.success) {
    return createActionState("error", "تاریخ یا ساختمان معتبر نیست.");
  }

  let reservation: {
    id: string;
    locationId: string;
  };

  try {
    reservation = await createLunchReservation({
      userId: user.id,
      locationId: parsed.data.locationId,
      date: buildLocalDateAtHourFromJalali(parsed.data.date, 0),
    });
  } catch (error) {
    return createActionState("error", getActionErrorMessage(error));
  }

  revalidatePath("/lunch");

  return createActionState("success", "رزرو ناهار ثبت شد.", {
    dateParam: parsed.data.date,
    reservation: {
      id: reservation.id,
      locationId: reservation.locationId,
      locationName: await getLocationName(reservation.locationId),
    },
    type: "create",
  });
}

export async function updateLunchReservationAction(
  _previousState: LunchActionState,
  formData: FormData,
): Promise<LunchActionState> {
  const user = await requireCurrentUser();
  const parsed = updateLunchReservationSchema.safeParse({
    reservationId: formData.get("reservationId"),
    date: formData.get("date"),
    locationId: formData.get("locationId"),
  });

  if (!parsed.success) {
    return createActionState("error", "رزرو یا ساختمان معتبر نیست.");
  }

  let reservation: {
    id: string;
    locationId: string;
  };

  try {
    reservation = await updateLunchReservationLocation({
      reservationId: parsed.data.reservationId,
      userId: user.id,
      locationId: parsed.data.locationId,
    });
  } catch (error) {
    return createActionState("error", getActionErrorMessage(error));
  }

  revalidatePath("/lunch");

  return createActionState("success", "محل دریافت ناهار تغییر کرد.", {
    dateParam: parsed.data.date,
    reservation: {
      id: reservation.id,
      locationId: reservation.locationId,
      locationName: await getLocationName(reservation.locationId),
    },
    type: "update",
  });
}

export async function cancelLunchReservationAction(
  _previousState: LunchActionState,
  formData: FormData,
): Promise<LunchActionState> {
  const user = await requireCurrentUser();
  const parsed = cancelLunchReservationSchema.safeParse({
    reservationId: formData.get("reservationId"),
  });

  if (!parsed.success) {
    return createActionState("error", "رزرو معتبر نیست.");
  }

  try {
    await cancelLunchReservationByUser({
      reservationId: parsed.data.reservationId,
      userId: user.id,
    });
  } catch (error) {
    return createActionState("error", getActionErrorMessage(error));
  }

  revalidatePath("/lunch");

  return createActionState("success", "رزرو ناهار لغو شد.", {
    reservationId: parsed.data.reservationId,
    type: "cancel",
  });
}
