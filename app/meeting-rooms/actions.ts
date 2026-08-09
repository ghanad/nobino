"use server";

import { revalidatePath } from "next/cache";
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
  cancelMeetingRoomReservationByUser,
  createMeetingRoomReservationRequest,
} from "@/lib/meeting-room-reservation-service";
import { ReservationTransitionError } from "@/lib/reservation-service";
import { ReservationTimeRangeError } from "@/lib/schedule";

const createSchema = z.object({
  roomId: z.string().min(1),
  date: z.string().refine(isValidJalaliDateParam),
  startHour: z.coerce.number().int().min(0).max(23),
  endHour: z.coerce.number().int().min(1).max(24),
  title: z.string().trim().max(120).optional(),
});

const reservationIdSchema = z.object({
  reservationId: z.string().min(1),
  roomId: z.string().optional(),
  date: z.string().optional(),
});

export type CreateMeetingRoomReservationActionState = {
  message: string;
  mutation?: {
    createdAt: string;
    endAt: string;
    reservationId: string;
    roomId: string;
    startAt: string;
    status: "APPROVED" | "PENDING";
    title: string | null;
    type: "create";
    userEmail: string | null;
    userId: string;
    userName: string | null;
  };
  status: "error" | "idle" | "success";
};

export type CancelMeetingRoomReservationActionState = {
  message: string;
  mutation?: {
    reservationId: string;
    type: "cancel";
  };
  status: "error" | "idle" | "success";
};

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

function redirectToMeetingRooms(
  params: Record<string, string | undefined>,
): never {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  redirect(`/meeting-rooms?${searchParams.toString()}`);
}

export async function createMeetingRoomReservationAction(
  formData: FormData,
): Promise<void> {
  const user = await requireCurrentUser();
  const parsed = createSchema.safeParse({
    roomId: formData.get("roomId"),
    date: formData.get("date"),
    startHour: formData.get("startHour"),
    endHour: formData.get("endHour"),
    title: formData.get("title") || undefined,
  });

  if (!parsed.success) {
    redirectToMeetingRooms({
      error: "تاریخ جلالی، اتاق و ساعت شروع و پایان را معتبر وارد کنید.",
    });
  }

  const startAt = buildLocalDateAtHourFromJalali(
    parsed.data.date,
    parsed.data.startHour,
  );
  const endAt = buildLocalDateAtHourFromJalali(
    parsed.data.date,
    parsed.data.endHour,
  );
  const dateParam = formatJalaliDateParam(startAt);

  try {
    await createMeetingRoomReservationRequest({
      userId: user.id,
      roomId: parsed.data.roomId,
      startAt,
      endAt,
      title: parsed.data.title,
    });
  } catch (error) {
    redirectToMeetingRooms({
      date: dateParam,
      error: getActionErrorMessage(error),
      roomId: parsed.data.roomId,
    });
  }

  redirectToMeetingRooms({
    created: "1",
    date: dateParam,
    roomId: parsed.data.roomId,
  });
}

export async function createMeetingRoomReservationInlineAction(
  _previousState: CreateMeetingRoomReservationActionState,
  formData: FormData,
): Promise<CreateMeetingRoomReservationActionState> {
  const user = await requireCurrentUser();
  const parsed = createSchema.safeParse({
    roomId: formData.get("roomId"),
    date: formData.get("date"),
    startHour: formData.get("startHour"),
    endHour: formData.get("endHour"),
    title: formData.get("title") || undefined,
  });

  if (!parsed.success) {
    return {
      message: "تاریخ جلالی، اتاق و ساعت شروع و پایان را معتبر وارد کنید.",
      status: "error",
    };
  }

  const startAt = buildLocalDateAtHourFromJalali(
    parsed.data.date,
    parsed.data.startHour,
  );
  const endAt = buildLocalDateAtHourFromJalali(
    parsed.data.date,
    parsed.data.endHour,
  );

  try {
    const reservation = await createMeetingRoomReservationRequest({
      userId: user.id,
      roomId: parsed.data.roomId,
      startAt,
      endAt,
      title: parsed.data.title,
    });

    return {
      message:
        reservation.status === "APPROVED"
          ? "رزرو اتاق جلسه تایید شد."
          : "درخواست رزرو اتاق جلسه ثبت شد و در انتظار بررسی است.",
      mutation: {
        createdAt: reservation.createdAt.toISOString(),
        endAt: reservation.endAt.toISOString(),
        reservationId: reservation.id,
        roomId: reservation.roomId,
        startAt: reservation.startAt.toISOString(),
        status: reservation.status === "APPROVED" ? "APPROVED" : "PENDING",
        title: reservation.title,
        type: "create",
        userEmail: user.email,
        userId: user.id,
        userName: user.name,
      },
      status: "success",
    };
  } catch (error) {
    return {
      message: getActionErrorMessage(error),
      status: "error",
    };
  }
}

export async function cancelMeetingRoomReservationAction(
  _previousState: CancelMeetingRoomReservationActionState,
  formData: FormData,
): Promise<CancelMeetingRoomReservationActionState> {
  const user = await requireCurrentUser();
  const parsed = reservationIdSchema.safeParse({
    reservationId: formData.get("reservationId"),
    roomId: formData.get("roomId") || undefined,
    date: formData.get("date") || undefined,
  });

  if (!parsed.success) {
    return { message: "رزرو اتاق جلسه معتبر انتخاب کنید.", status: "error" };
  }

  try {
    await cancelMeetingRoomReservationByUser({
      reservationId: parsed.data.reservationId,
      userId: user.id,
    });
  } catch (error) {
    return { message: getActionErrorMessage(error), status: "error" };
  }

  revalidatePath("/meeting-rooms");

  return {
    message: "رزرو اتاق جلسه لغو شد.",
    mutation: { reservationId: parsed.data.reservationId, type: "cancel" },
    status: "success",
  };
}
