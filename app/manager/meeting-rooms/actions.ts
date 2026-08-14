"use server";

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

export type ManagerMeetingRoomActionState = {
  id?: string;
  message?: string;
  mutation?: {
    reservationId: string;
    type: "approve" | "remove";
  };
  ok?: boolean;
};

const rejectSchema = z.object({
  reservationId: z.string().min(1),
  rejectionReason: z.string().trim().max(500).optional(),
});

function result(
  ok: boolean,
  message: string,
  mutation?: ManagerMeetingRoomActionState["mutation"],
): ManagerMeetingRoomActionState {
  return { id: crypto.randomUUID(), message, mutation, ok };
}

function errorMessage(error: unknown): string {
  if (
    error instanceof ReservationTransitionError ||
    error instanceof CapacityUnavailableError ||
    error instanceof ReservationTimeRangeError
  ) {
    return error.message;
  }

  throw error;
}

export async function approveMeetingRoomReservationAction(
  _state: ManagerMeetingRoomActionState,
  formData: FormData,
): Promise<ManagerMeetingRoomActionState> {
  const manager = await requireCurrentUser();
  const reservationId = String(formData.get("reservationId") || "");
  if (!reservationId) return result(false, "درخواست رزرو اتاق جلسه معتبر نیست.");
  try {
    await approveMeetingRoomReservation({ managerId: manager.id, reservationId });
  } catch (error) {
    return result(false, errorMessage(error));
  }
  revalidatePath("/meeting-rooms");
  return result(true, "درخواست رزرو اتاق جلسه تأیید شد.", {
    reservationId,
    type: "approve",
  });
}

export async function rejectMeetingRoomReservationAction(
  _state: ManagerMeetingRoomActionState,
  formData: FormData,
): Promise<ManagerMeetingRoomActionState> {
  const manager = await requireCurrentUser();
  const parsed = rejectSchema.safeParse({
    reservationId: formData.get("reservationId"),
    rejectionReason: formData.get("rejectionReason") || undefined,
  });
  if (!parsed.success) return result(false, "درخواست رزرو اتاق جلسه معتبر نیست.");
  try {
    await rejectMeetingRoomReservation({
      managerId: manager.id,
      rejectionReason: parsed.data.rejectionReason,
      reservationId: parsed.data.reservationId,
    });
  } catch (error) {
    return result(false, errorMessage(error));
  }
  revalidatePath("/meeting-rooms");
  return result(true, "درخواست رزرو اتاق جلسه رد شد.", {
    reservationId: parsed.data.reservationId,
    type: "remove",
  });
}

export async function cancelMeetingRoomReservationByManagerAction(
  _state: ManagerMeetingRoomActionState,
  formData: FormData,
): Promise<ManagerMeetingRoomActionState> {
  const manager = await requireCurrentUser();
  const reservationId = String(formData.get("reservationId") || "");
  if (!reservationId) return result(false, "رزرو اتاق جلسه معتبر نیست.");
  try {
    await cancelMeetingRoomReservationByManager({
      managerId: manager.id,
      reservationId,
    });
  } catch (error) {
    return result(false, errorMessage(error));
  }
  revalidatePath("/meeting-rooms");
  return result(true, "رزرو اتاق جلسه لغو شد.", {
    reservationId,
    type: "remove",
  });
}
