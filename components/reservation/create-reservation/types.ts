"use client";

import type { LunchActionState } from "@/app/lunch/actions";
import type { CreateReservationActionState } from "@/app/reservations/actions";

export type ResourcePoolOption = {
  building: BuildingOption;
  id: string;
  name: string;
};

export type BuildingOption = {
  id: string;
  name: string;
};

export type LunchAvailability = {
  cutoffLabel: string;
  existingReservation: {
    buildingName: string;
    id: string;
    buildingId: string;
    breakfastReserved: boolean;
    lunchReserved: boolean;
  } | null;
  isOpen: boolean;
  unavailableReason: string | null;
};

export type SlotReservationDetail = {
  email: string | null;
  id: string;
  partySize: number;
  userId: string;
  userName: string | null;
};

export type RequestableSlot = {
  slotStartHour: number;
  slotEndHour: number;
  approvedCount: number;
  approvedReservations: SlotReservationDetail[];
  pendingCount: number;
  pendingReservations: SlotReservationDetail[];
  capacity: number;
  isRequestable: boolean;
  myReservationId: string | null;
  myReservationStatus: "ALTERNATIVE_PROPOSED" | "APPROVED" | "PENDING" | null;
  unavailableReason: "full" | "past" | null;
};

export type WeekDay = {
  closedReason: string | null;
  dateLabel: string;
  modalDateLabel: string;
  dateParam: string;
  shortLabel: string;
  slots: RequestableSlot[];
};

export type CreateReservationFormProps = {
  action: (
    previousState: CreateReservationActionState,
    formData: FormData,
  ) => Promise<CreateReservationActionState>;
  currentDateParam: string;
  dailyActiveReservationCountByDate: Record<string, number>;
  dailyReservedHoursByDate: Record<string, number>;
  dailyUserHourLimit: number;
  emptyMessage: string;
  lunchAvailabilityByDate: Record<string, LunchAvailability>;
  buildings: BuildingOption[];
  lunchReservationAction: (
    previousState: LunchActionState,
    formData: FormData,
  ) => Promise<LunchActionState>;
  nextWeekDateParam: string;
  oneReservationPerDayEnabled: boolean;
  previousWeekDateParam: string;
  resourcePools: ResourcePoolOption[];
  todayDateParam: string;
  onReservationCreated?: (
    mutation: NonNullable<CreateReservationActionState["mutation"]>,
  ) => void;
  onFoodReservationChanged?: (
    mutation: NonNullable<LunchActionState["mutation"]>,
  ) => void;
  weekDays: WeekDay[];
  weekLabel: string;
};

export type Selection = {
  anchorHour: number;
  dateParam: string;
  dayIndex: number;
  endHour: number;
  startHour: number;
};

export type CellState = {
  approvedCount: number;
  approvedReservations: SlotReservationDetail[];
  availableCount: number;
  capacity: number;
  isRequestable: boolean;
  isWorkingHour: boolean;
  myReservationId: string | null;
  myReservationStatus: "ALTERNATIVE_PROPOSED" | "APPROVED" | "PENDING" | null;
  pendingCount: number;
  pendingReservations: SlotReservationDetail[];
  unavailableReason: "full" | "past" | null;
};

export type CapacityDotTone = "approved" | "free" | "mine";

export type MobileSelectionHandle = "end" | "start";
export type SelectionSource = "desktop" | "mobile";

export type ActionToast = {
  id: number;
  message: string;
  variant: "error" | "success";
};

export type ActionStateBase = {
  status: "error" | "idle" | "success";
};

export type LunchPrompt = {
  canOfferBreakfast: boolean;
  dateLabel: string;
  dateParam: string;
  partySize: number;
  sourceReservationId: string;
  sourceBuildingId: string;
  sourceBuildingName: string;
};
