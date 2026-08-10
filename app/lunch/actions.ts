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
  buildingId: z.string().min(1),
  breakfastReserved: z.boolean(),
  lunchReserved: z.boolean(),
  reservationId: z.string().min(1).optional(),
  sourceReservationId: z.string().min(1).optional(),
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
          buildingId: string;
          buildingName: string;
          breakfastReserved: boolean;
          lunchReserved: boolean;
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

async function getLocationName(buildingId: string): Promise<string> {
  const building = await db.building.findUnique({
    where: { id: buildingId },
    select: { name: true },
  });

  return building?.name ?? "";
}

export async function createLunchReservationAction(
  _previousState: LunchActionState,
  formData: FormData,
): Promise<LunchActionState> {
  const user = await requireCurrentUser();
  const parsed = lunchReservationSchema.safeParse({
    date: formData.get("date"),
    buildingId: formData.get("buildingId"),
    breakfastReserved: formData.has("breakfastReserved"),
    lunchReserved: formData.has("lunchReserved"),
    reservationId: formData.get("reservationId") || undefined,
    sourceReservationId: formData.get("sourceReservationId") || undefined,
  });

  if (!parsed.success) {
    return createActionState("error", "تاریخ یا ساختمان معتبر نیست.");
  }

  let reservation: {
    id: string;
    buildingId: string;
    breakfastReserved: boolean;
    lunchReserved: boolean;
  };

  try {
    reservation = parsed.data.reservationId
      ? await updateLunchReservationLocation({
          reservationId: parsed.data.reservationId,
          userId: user.id,
          buildingId: parsed.data.buildingId,
          breakfastReserved: parsed.data.breakfastReserved,
          lunchReserved: parsed.data.lunchReserved,
          sourceReservationId: parsed.data.sourceReservationId,
        })
      : await createLunchReservation({
          userId: user.id,
          buildingId: parsed.data.buildingId,
          date: buildLocalDateAtHourFromJalali(parsed.data.date, 0),
          breakfastReserved: parsed.data.breakfastReserved,
          lunchReserved: parsed.data.lunchReserved,
          sourceReservationId: parsed.data.sourceReservationId,
        });
  } catch (error) {
    return createActionState("error", getActionErrorMessage(error));
  }

  revalidatePath("/lunch");
  revalidatePath("/lunch/report");
  revalidatePath("/reservations");

  return createActionState(
    "success",
    parsed.data.reservationId ? "رزرو غذا تغییر کرد." : "رزرو غذا ثبت شد.",
    {
    dateParam: parsed.data.date,
    reservation: {
      id: reservation.id,
      buildingId: reservation.buildingId,
      buildingName: await getLocationName(reservation.buildingId),
      breakfastReserved: reservation.breakfastReserved,
      lunchReserved: reservation.lunchReserved,
    },
      type: parsed.data.reservationId ? "update" : "create",
    },
  );
}

export async function updateLunchReservationAction(
  _previousState: LunchActionState,
  formData: FormData,
): Promise<LunchActionState> {
  const user = await requireCurrentUser();
  const parsed = updateLunchReservationSchema.safeParse({
    reservationId: formData.get("reservationId"),
    date: formData.get("date"),
    buildingId: formData.get("buildingId"),
    breakfastReserved: formData.has("breakfastReserved"),
    lunchReserved: formData.has("lunchReserved"),
    sourceReservationId: formData.get("sourceReservationId") || undefined,
  });

  if (!parsed.success) {
    return createActionState("error", "رزرو یا ساختمان معتبر نیست.");
  }

  let reservation: {
    id: string;
    buildingId: string;
    breakfastReserved: boolean;
    lunchReserved: boolean;
  };

  try {
    reservation = await updateLunchReservationLocation({
      reservationId: parsed.data.reservationId,
      userId: user.id,
      buildingId: parsed.data.buildingId,
      breakfastReserved: parsed.data.breakfastReserved,
      lunchReserved: parsed.data.lunchReserved,
      sourceReservationId: parsed.data.sourceReservationId,
    });
  } catch (error) {
    return createActionState("error", getActionErrorMessage(error));
  }

  revalidatePath("/lunch");
  revalidatePath("/lunch/report");
  revalidatePath("/reservations");

  return createActionState("success", "رزرو غذا تغییر کرد.", {
    dateParam: parsed.data.date,
    reservation: {
      id: reservation.id,
      buildingId: reservation.buildingId,
      buildingName: await getLocationName(reservation.buildingId),
      breakfastReserved: reservation.breakfastReserved,
      lunchReserved: reservation.lunchReserved,
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
  revalidatePath("/lunch/report");
  revalidatePath("/reservations");

  return createActionState("success", "رزرو غذا لغو شد.", {
    reservationId: parsed.data.reservationId,
    type: "cancel",
  });
}
