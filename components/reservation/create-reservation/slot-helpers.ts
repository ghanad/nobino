"use client";

import {
  formatPersianHour,
  formatPersianNumber,
} from "@/components/reservation/create-reservation/formatters";
import type {
  CellState,
  Selection,
  WeekDay,
} from "@/components/reservation/create-reservation/types";

export function getHourRange(weekDays: WeekDay[]): number[] {
  const slotHours = weekDays.flatMap((day) =>
    day.slots.flatMap((slot) => [slot.slotStartHour, slot.slotEndHour]),
  );

  if (slotHours.length === 0) {
    return [];
  }

  const minHour = Math.min(...slotHours);
  const maxHour = Math.max(...slotHours);

  return Array.from({ length: maxHour - minHour }, (_, index) => minHour + index);
}

export function getCellState(day: WeekDay, hour: number): CellState {
  const slot = day.slots.find((item) => item.slotStartHour === hour);

  if (!slot) {
    return {
      approvedCount: 0,
      approvedReservations: [],
      availableCount: 0,
      capacity: 0,
      isRequestable: false,
      isWorkingHour: false,
      myReservationId: null,
      myReservationStatus: null,
      pendingCount: 0,
      pendingReservations: [],
      unavailableReason: null,
    };
  }

  return {
    approvedCount: slot.approvedCount,
    approvedReservations: slot.approvedReservations,
    availableCount: Math.max(slot.capacity - slot.approvedCount, 0),
    capacity: slot.capacity,
    isRequestable: slot.isRequestable,
    isWorkingHour: true,
    myReservationId: slot.myReservationId,
    myReservationStatus: slot.myReservationStatus,
    pendingCount: slot.pendingCount,
    pendingReservations: slot.pendingReservations,
    unavailableReason: slot.unavailableReason,
  };
}

export function getPersianUserStatusLabel(
  status: CellState["myReservationStatus"],
): string | null {
  if (status === "ALTERNATIVE_PROPOSED") {
    return "وضعیت شما نیازمند بررسی زمان پیشنهادی مدیر";
  }

  if (status === "PENDING") {
    return "وضعیت شما در انتظار تایید مدیر";
  }

  if (status === "APPROVED") {
    return "وضعیت شما رزرو تاییدشده";
  }

  return null;
}

export function getPersianUnavailableLabel(
  reason: CellState["unavailableReason"],
): string | null {
  if (reason === "full") {
    return "ظرفیت این ساعت تکمیل است";
  }

  if (reason === "past") {
    return "این زمان گذشته و قابل رزرو نیست";
  }

  return null;
}

export function buildSlotAriaLabel(
  day: WeekDay,
  hour: number,
  cell: CellState,
): string {
  if (day.closedReason || !cell.isWorkingHour) {
    return [
      day.dateLabel,
      day.closedReason ?? "روز غیرکاری",
      "این روز قابل رزرو نیست",
    ].join("، ");
  }

  if (cell.unavailableReason === "past") {
    return [
      day.dateLabel,
      `ساعت ${formatPersianHour(hour)}`,
      "این زمان گذشته و قابل رزرو نیست",
    ].join("، ");
  }

  const parts = [
    day.dateLabel,
    `ساعت ${formatPersianHour(hour)}`,
    `ظرفیت آزاد ${formatPersianNumber(cell.availableCount)} از ${formatPersianNumber(
      cell.capacity,
    )}`,
    `${formatPersianNumber(cell.approvedCount)} رزرو تاییدشده`,
    `${formatPersianNumber(cell.pendingCount)} درخواست در انتظار تایید`,
    getPersianUserStatusLabel(cell.myReservationStatus),
    cell.myReservationStatus
      ? null
      : getPersianUnavailableLabel(cell.unavailableReason),
  ];

  return parts.filter(Boolean).join("، ");
}

export function selectionContainsHour(
  selection: Selection | null,
  dayIndex: number,
  hour: number,
) {
  if (!selection || selection.dayIndex !== dayIndex) {
    return false;
  }

  return hour >= selection.startHour && hour < selection.endHour;
}

export function isSelectionStart(
  selection: Selection | null,
  dayIndex: number,
  hour: number,
) {
  return Boolean(
    selection && selection.dayIndex === dayIndex && selection.startHour === hour,
  );
}

export function isSelectionEnd(
  selection: Selection | null,
  dayIndex: number,
  hour: number,
) {
  return Boolean(
    selection && selection.dayIndex === dayIndex && selection.endHour === hour + 1,
  );
}

export function buildSelection(
  weekDays: WeekDay[],
  dayIndex: number,
  anchorHour: number,
  targetHour: number,
): Selection | null {
  const day = weekDays[dayIndex];

  if (!day) {
    return null;
  }

  const step = targetHour >= anchorHour ? 1 : -1;
  let boundedHour = anchorHour;

  for (
    let hour = anchorHour + step;
    step > 0 ? hour <= targetHour : hour >= targetHour;
    hour += step
  ) {
    if (!getCellState(day, hour).isRequestable) {
      break;
    }

    boundedHour = hour;
  }

  const startHour = Math.min(anchorHour, boundedHour);
  const endHour = Math.max(anchorHour, boundedHour) + 1;

  return {
    anchorHour,
    dateParam: day.dateParam,
    dayIndex,
    endHour,
    startHour,
  };
}

export function getDefaultSelectedDayIndex(
  weekDays: WeekDay[],
  todayDateParam: string,
): number {
  const todayIndex = weekDays.findIndex(
    (day) => day.dateParam === todayDateParam,
  );

  if (todayIndex >= 0) {
    return todayIndex;
  }

  const firstWorkingDayIndex = weekDays.findIndex(
    (day) => !day.closedReason && day.slots.length > 0,
  );

  return firstWorkingDayIndex >= 0 ? firstWorkingDayIndex : 0;
}

export function getMobileSlotStatusLabel(cell: CellState): string | null {
  if (cell.myReservationStatus === "ALTERNATIVE_PROPOSED") {
    return "زمان پیشنهادی مدیر نیازمند بررسی شماست";
  }

  if (cell.myReservationStatus === "PENDING") {
    return "درخواست شما در انتظار تایید است";
  }

  if (cell.myReservationStatus === "APPROVED") {
    return "رزرو تاییدشده شما";
  }

  if (cell.unavailableReason === "past") {
    return "این زمان گذشته و قابل رزرو نیست";
  }

  if (cell.unavailableReason === "full") {
    return "ظرفیت تکمیل است";
  }

  return null;
}

export function getMobileSlotStatusBadgeLabel(cell: CellState): string | null {
  if (cell.myReservationStatus === "ALTERNATIVE_PROPOSED") {
    return "جایگزین";
  }

  if (cell.myReservationStatus === "PENDING") {
    return "در انتظار";
  }

  if (cell.myReservationStatus === "APPROVED") {
    return "تایید شده";
  }

  return null;
}

export function getMobileSlotToneClass(cell: CellState): string {
  if (cell.myReservationStatus === "APPROVED") {
    return "border-sky-200 bg-sky-50/70";
  }

  if (
    cell.myReservationStatus === "PENDING" ||
    cell.myReservationStatus === "ALTERNATIVE_PROPOSED"
  ) {
    return "border-amber-200 bg-amber-50/70";
  }

  if (cell.unavailableReason || !cell.isRequestable) {
    return "border-slate-200 bg-slate-50/80";
  }

  return "border-emerald-200 bg-white";
}

export function isMobileSlotSelectable(cell: CellState): boolean {
  return cell.isRequestable && !cell.myReservationStatus;
}

export function getMobileSlotUnavailableLabel(cell: CellState): string {
  if (cell.myReservationStatus === "ALTERNATIVE_PROPOSED") {
    return "زمان پیشنهادی مدیر برای شما ثبت شده است";
  }

  if (cell.myReservationStatus === "PENDING") {
    return "درخواست شما در انتظار تایید است";
  }

  if (cell.myReservationStatus === "APPROVED") {
    return "رزرو تاییدشده شما";
  }

  return getPersianUnavailableLabel(cell.unavailableReason) ?? "قابل رزرو نیست";
}

export function getSelectionRangeError(
  weekDays: WeekDay[],
  selection: Selection | null,
): string | null {
  if (!selection) {
    return null;
  }

  const day = weekDays[selection.dayIndex];

  if (!day) {
    return "روز انتخاب‌شده معتبر نیست.";
  }

  for (let hour = selection.startHour; hour < selection.endHour; hour += 1) {
    const cell = getCellState(day, hour);

    if (!cell.isWorkingHour) {
      return `امکان رزرو این بازه وجود ندارد، چون ساعت ${formatPersianHour(
        hour,
      )} در برنامه کاری این روز نیست.`;
    }

    if (!isMobileSlotSelectable(cell)) {
      return `امکان رزرو این بازه وجود ندارد، چون ساعت ${formatPersianHour(
        hour,
      )} ${getMobileSlotUnavailableLabel(cell)}.`;
    }
  }

  return null;
}

export function getSelectionLimitError({
  dailyUserHourLimit,
  hasActiveReservationForSelectedDay,
  isSelectionOverDailyLimit,
  reservedHoursForSelectedDay,
}: {
  dailyUserHourLimit: number;
  hasActiveReservationForSelectedDay: boolean;
  isSelectionOverDailyLimit: boolean;
  reservedHoursForSelectedDay: number;
}): string | null {
  if (isSelectionOverDailyLimit) {
    return `شما نمی‌توانید بیش از ${formatPersianNumber(
      dailyUserHourLimit,
    )} ساعت در یک روز رزرو کنید. در این روز قبلا ${formatPersianNumber(
      reservedHoursForSelectedDay,
    )} ساعت رزرو فعال دارید.`;
  }

  if (hasActiveReservationForSelectedDay) {
    return "شما در این روز یک درخواست رزرو فعال دارید.";
  }

  return null;
}
