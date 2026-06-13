"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import { CapacityUnavailableError } from "@/lib/capacity-service";
import { db } from "@/lib/db";
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
  partySize: z.coerce.number().int().min(1).max(20),
  reason: z.string().trim().max(500).optional(),
});

const reservationIdSchema = z.object({
  reservationId: z.string().min(1),
});

export type CancelReservationActionState = {
  message: string;
  mutation?: {
    reservationId: string;
    type: "cancel";
  };
  status: "error" | "idle" | "success";
};

export type CreateReservationActionState = {
  message: string;
  mutation?: {
    createdAt: string;
    endAt: string;
    partySize: number;
    reason: string | null;
    reservationId: string;
    resourcePoolId: string;
    resourcePoolName: string;
    startAt: string;
    type: "create";
    userEmail: string | null;
    userId: string;
    userName: string | null;
  };
  status: "error" | "idle" | "success";
};

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
    partySize: formData.get("partySize"),
    reason: formData.get("reason") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(
      "Enter a valid Jalali date, start hour, end hour, and people count.",
    );
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
      partySize: parsed.data.partySize,
      reason: parsed.data.reason,
    });
  } catch (error) {
    redirectWithError(getActionErrorMessage(error), dateParam);
  }

  redirect(`/reservations?created=1&date=${dateParam}`);
}

export async function createReservationInlineAction(
  _previousState: CreateReservationActionState,
  formData: FormData,
): Promise<CreateReservationActionState> {
  const user = await requireCurrentUser();
  const parsed = reservationFormSchema.safeParse({
    resourcePoolId: formData.get("resourcePoolId"),
    date: formData.get("date"),
    startHour: formData.get("startHour"),
    endHour: formData.get("endHour"),
    partySize: formData.get("partySize"),
    reason: formData.get("reason") || undefined,
  });

  if (!parsed.success) {
    return {
      message: "Enter a valid Jalali date, start hour, end hour, and people count.",
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
    const reservation = await createReservationRequest({
      userId: user.id,
      resourcePoolId: parsed.data.resourcePoolId,
      startAt,
      endAt,
      partySize: parsed.data.partySize,
      reason: parsed.data.reason,
    });
    const resourcePool = await db.resourcePool.findUnique({
      where: { id: reservation.resourcePoolId },
      select: { name: true },
    });

    return {
      message: "درخواست رزرو ثبت شد و برای تایید مدیر ارسال شد.",
      mutation: {
        createdAt: reservation.createdAt.toISOString(),
        endAt: reservation.endAt.toISOString(),
        partySize: reservation.partySize,
        reason: reservation.reason,
        reservationId: reservation.id,
        resourcePoolId: reservation.resourcePoolId,
        resourcePoolName: resourcePool?.name ?? "سیستم رزرو",
        startAt: reservation.startAt.toISOString(),
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

export async function cancelReservationByUserInlineAction(
  _previousState: CancelReservationActionState,
  formData: FormData,
): Promise<CancelReservationActionState> {
  const user = await requireCurrentUser();
  const parsed = reservationIdSchema.safeParse({
    reservationId: formData.get("reservationId"),
  });

  if (!parsed.success) {
    return {
      message: "Choose a valid reservation to cancel.",
      status: "error",
    };
  }

  try {
    await cancelReservationByUser({
      reservationId: parsed.data.reservationId,
      userId: user.id,
    });
  } catch (error) {
    return {
      message: getActionErrorMessage(error),
      status: "error",
    };
  }

  return {
    message: "رزرو لغو شد و ظرفیت آن آزاد شد.",
    mutation: {
      reservationId: parsed.data.reservationId,
      type: "cancel",
    },
    status: "success",
  };
}
