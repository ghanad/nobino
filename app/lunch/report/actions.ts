"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import { isValidJalaliDateParam } from "@/lib/jalali-date";
import {
  cancelLunchReservationByManager,
  LunchReservationError,
} from "@/lib/lunch-service";

const cancelLunchReservationSchema = z.object({
  date: z.string().refine(isValidJalaliDateParam),
  reservationId: z.string().min(1),
});

export type CancelLunchReservationActionState = {
  message: string;
  status: "error" | "idle" | "success";
};

export async function cancelLunchReservationByManagerAction(
  _previousState: CancelLunchReservationActionState,
  formData: FormData,
): Promise<CancelLunchReservationActionState> {
  const user = await requireCurrentUser();
  const parsed = cancelLunchReservationSchema.safeParse({
    date: formData.get("date"),
    reservationId: formData.get("reservationId"),
  });

  if (!parsed.success) {
    return { message: "رزرو غذا معتبر نیست.", status: "error" };
  }

  try {
    await cancelLunchReservationByManager({
      managerId: user.id,
      reservationId: parsed.data.reservationId,
    });
  } catch (error) {
    if (error instanceof LunchReservationError) {
      return { message: error.message, status: "error" };
    }

    throw error;
  }

  revalidatePath("/lunch/report");
  revalidatePath("/lunch");
  revalidatePath("/reservations");
  return { message: "رزرو غذا لغو شد.", status: "success" };
}
