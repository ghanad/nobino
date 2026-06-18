import {
  formatPersianNumber,
  formatPersianShortHourRange,
} from "./formatting";
import type { ManagerWeekDay, ManagerWeekSlot } from "./types";

export function getMobileSlotToneClass(slot: ManagerWeekSlot): string {
  if (slot.approvedCount >= slot.capacity) {
    return "border-red-200 bg-red-50";
  }

  if (slot.pendingCount > 0) {
    return "border-amber-200 bg-amber-50/70";
  }

  return "border-slate-100 bg-background";
}

export function getMobileSlotStatusLabel(slot: ManagerWeekSlot): string {
  const available = Math.max(slot.capacity - slot.approvedCount, 0);

  if (available === 0) {
    return "ظرفیت تکمیل است";
  }

  return `${formatPersianNumber(available)} ظرفیت آزاد`;
}

export function buildMobileSlotAriaLabel(
  day: ManagerWeekDay,
  slot: ManagerWeekSlot,
): string {
  return [
    day.dateLabel,
    `ساعت ${formatPersianShortHourRange(
      slot.slotStartHour,
      slot.slotEndHour,
    )}`,
    `${formatPersianNumber(slot.approvedCount)} رزرو تاییدشده`,
    `${formatPersianNumber(slot.pendingCount)} درخواست در انتظار`,
    `${formatPersianNumber(Math.max(slot.capacity - slot.approvedCount, 0))} ظرفیت آزاد`,
  ].join("، ");
}
