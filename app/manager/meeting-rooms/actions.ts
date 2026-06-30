"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import { CapacityUnavailableError } from "@/lib/capacity-service";
import {
  approveMeetingRoomReservation,
  cancelMeetingRoomReservationByManager,
  rejectMeetingRoomReservation,
} from "@/lib/meeting-room-reservation-service";
import { ReservationTransitionError } from "@/lib/reservation-service";
import { ReservationTimeRangeError } from "@/lib/schedule";

const reservationIdSchema = z.object({
  reservationId: z.string().min(1),
});

const rejectSchema = reservationIdSchema.extend({
  rejectionReason: z.string().trim().max(500).optional(),
});

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

function redirectToManager(params: Record<string, string | undefined>): never {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  redirect(`/manager/meeting-rooms?${searchParams.toString()}`);
}

export async function approveMeetingRoomReservationAction(
  formData: FormData,
): Promise<void> {
  const user = await requireCurrentUser();
  const parsed = reservationIdSchema.safeParse({
    reservationId: formData.get("reservationId"),
  });

  if (!parsed.success) {
    redirectToManager({ error: "رزرو اتاق جلسه معتبر انتخاب کنید." });
  }

  try {
    await approveMeetingRoomReservation({
      reservationId: parsed.data.reservationId,
      managerId: user.id,
    });
  } catch (error) {
    redirectToManager({ error: getActionErrorMessage(error) });
  }

  revalidatePath("/meeting-rooms");
  redirectToManager({ approved: "1" });
}

export async function rejectMeetingRoomReservationAction(
  formData: FormData,
): Promise<void> {
  const user = await requireCurrentUser();
  const parsed = rejectSchema.safeParse({
    reservationId: formData.get("reservationId"),
    rejectionReason: formData.get("rejectionReason") || undefined,
  });

  if (!parsed.success) {
    redirectToManager({ error: "رزرو اتاق جلسه معتبر انتخاب کنید." });
  }

  try {
    await rejectMeetingRoomReservation({
      reservationId: parsed.data.reservationId,
      managerId: user.id,
      rejectionReason: parsed.data.rejectionReason,
    });
  } catch (error) {
    redirectToManager({ error: getActionErrorMessage(error) });
  }

  revalidatePath("/meeting-rooms");
  redirectToManager({ rejected: "1" });
}

export async function cancelMeetingRoomReservationByManagerAction(
  formData: FormData,
): Promise<void> {
  const user = await requireCurrentUser();
  const parsed = reservationIdSchema.safeParse({
    reservationId: formData.get("reservationId"),
  });

  if (!parsed.success) {
    redirectToManager({ error: "رزرو اتاق جلسه معتبر انتخاب کنید." });
  }

  try {
    await cancelMeetingRoomReservationByManager({
      reservationId: parsed.data.reservationId,
      managerId: user.id,
    });
  } catch (error) {
    redirectToManager({ error: getActionErrorMessage(error) });
  }

  revalidatePath("/meeting-rooms");
  redirectToManager({ cancelled: "1" });
}
