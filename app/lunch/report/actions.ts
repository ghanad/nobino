"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

function redirectToLunchReport(
  date: string,
  params: Record<string, string>,
): never {
  const searchParams = new URLSearchParams({ date, ...params });
  redirect(`/lunch/report?${searchParams.toString()}`);
}

export async function cancelLunchReservationByManagerAction(
  formData: FormData,
): Promise<void> {
  const user = await requireCurrentUser();
  const parsed = cancelLunchReservationSchema.safeParse({
    date: formData.get("date"),
    reservationId: formData.get("reservationId"),
  });

  if (!parsed.success) {
    redirect("/lunch/report?error=رزرو غذا معتبر نیست.");
  }

  try {
    await cancelLunchReservationByManager({
      managerId: user.id,
      reservationId: parsed.data.reservationId,
    });
  } catch (error) {
    if (error instanceof LunchReservationError) {
      redirectToLunchReport(parsed.data.date, { error: error.message });
    }

    throw error;
  }

  revalidatePath("/lunch/report");
  revalidatePath("/lunch");
  revalidatePath("/reservations");
  redirectToLunchReport(parsed.data.date, { cancelled: "1" });
}
