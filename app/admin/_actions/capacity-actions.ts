"use server";

import { UserRole } from "@prisma/client";
import { z } from "zod";

import {
  createCapacityException,
  deleteCapacityException,
  updateCapacityException,
  updateReservationPolicy,
  updateResourcePoolSettings,
} from "@/lib/admin-settings-service";
import { requireRole } from "@/lib/auth";
import {
  isValidJalaliDateParam,
  parseJalaliDateParam,
} from "@/lib/jalali-date";

import {
  checkboxToBoolean,
  emptyToUndefined,
  getActionErrorMessage,
  redirectToAdmin,
} from "./shared";

const resourcePoolSchema = z.object({
  resourcePoolId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  capacity: z.coerce.number().int().min(1).max(50),
  active: z.coerce.boolean(),
});

const reservationPolicySchema = z.object({
  dailyUserHourLimit: z.coerce.number().int().min(1).max(24),
  oneReservationPerDayEnabled: z.coerce.boolean(),
});

const createCapacityExceptionSchema = z.object({
  resourcePoolId: z.string().min(1),
  date: z.string().refine(isValidJalaliDateParam),
  capacity: z.coerce.number().int().min(0).max(50),
  reason: z.string().trim().max(200).optional(),
});

const updateCapacityExceptionSchema = z.object({
  capacityExceptionId: z.string().min(1),
  capacity: z.coerce.number().int().min(0).max(50),
  reason: z.string().trim().max(200).optional(),
});

const deleteCapacityExceptionSchema = z.object({
  capacityExceptionId: z.string().min(1),
});

export async function updateResourcePoolAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = resourcePoolSchema.safeParse({
    resourcePoolId: formData.get("resourcePoolId"),
    name: formData.get("name"),
    capacity: formData.get("capacity"),
    active: checkboxToBoolean(formData.get("active")),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Enter a valid resource pool name and capacity.",
      tab: "capacity",
    });
  }

  try {
    await updateResourcePoolSettings({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "capacity" });
  }

  redirectToAdmin({ poolUpdated: "1", tab: "capacity" });
}

export async function updateReservationPolicyAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = reservationPolicySchema.safeParse({
    dailyUserHourLimit: formData.get("dailyUserHourLimit"),
    oneReservationPerDayEnabled: checkboxToBoolean(
      formData.get("oneReservationPerDayEnabled"),
    ),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Enter a valid daily user reservation limit.",
      tab: "capacity",
    });
  }

  try {
    await updateReservationPolicy({
      adminId: admin.id,
      dailyUserHourLimit: parsed.data.dailyUserHourLimit,
      oneReservationPerDayEnabled: parsed.data.oneReservationPerDayEnabled,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "capacity" });
  }

  redirectToAdmin({ reservationPolicyUpdated: "1", tab: "capacity" });
}

export async function createCapacityExceptionAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = createCapacityExceptionSchema.safeParse({
    resourcePoolId: formData.get("resourcePoolId"),
    date: formData.get("date"),
    capacity: formData.get("capacity"),
    reason: emptyToUndefined(formData.get("reason")),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Enter a valid resource pool, Jalali date, and capacity.",
      tab: "capacity",
    });
  }

  const date = parseJalaliDateParam(parsed.data.date);

  if (!date) {
    redirectToAdmin({
      error: "Enter a valid Jalali capacity date.",
      tab: "capacity",
    });
  }

  try {
    await createCapacityException({
      adminId: admin.id,
      resourcePoolId: parsed.data.resourcePoolId,
      date,
      capacity: parsed.data.capacity,
      reason: parsed.data.reason,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "capacity" });
  }

  redirectToAdmin({ capacityExceptionCreated: "1", tab: "capacity" });
}

export async function updateCapacityExceptionAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = updateCapacityExceptionSchema.safeParse({
    capacityExceptionId: formData.get("capacityExceptionId"),
    capacity: formData.get("capacity"),
    reason: emptyToUndefined(formData.get("reason")),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Enter a valid daily capacity value.",
      tab: "capacity",
    });
  }

  try {
    await updateCapacityException({
      adminId: admin.id,
      exceptionId: parsed.data.capacityExceptionId,
      capacity: parsed.data.capacity,
      reason: parsed.data.reason,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "capacity" });
  }

  redirectToAdmin({ capacityExceptionUpdated: "1", tab: "capacity" });
}

export async function deleteCapacityExceptionAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = deleteCapacityExceptionSchema.safeParse({
    capacityExceptionId: formData.get("capacityExceptionId"),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Choose a valid capacity exception to delete.",
      tab: "capacity",
    });
  }

  try {
    await deleteCapacityException({
      adminId: admin.id,
      exceptionId: parsed.data.capacityExceptionId,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "capacity" });
  }

  redirectToAdmin({ capacityExceptionDeleted: "1", tab: "capacity" });
}
