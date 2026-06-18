import type {
  ManagerWeekDay,
  ManagerWeekSlot,
} from "@/components/calendar/manager-weekly-calendar/types";

export function getHourRange(weekDays: ManagerWeekDay[]): number[] {
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

export function getSlotForHour(
  day: ManagerWeekDay,
  hour: number,
): ManagerWeekSlot | null {
  return day.slots.find((slot) => slot.slotStartHour === hour) ?? null;
}

export function getCellTone(slot: ManagerWeekSlot | null): string {
  if (!slot) {
    return "bg-slate-50/80 text-muted-foreground";
  }

  if (slot.approvedCount >= slot.capacity) {
    return "bg-slate-50/80 text-red-900";
  }

  return "bg-white hover:bg-sky-50/50";
}

export function getDefaultSelectedDayIndex(
  weekDays: ManagerWeekDay[],
  currentDateParam: string,
): number {
  const currentDateIndex = weekDays.findIndex(
    (day) => day.dateParam === currentDateParam,
  );

  if (currentDateIndex >= 0) {
    return currentDateIndex;
  }

  const firstWorkingDayIndex = weekDays.findIndex(
    (day) => !day.closedReason && day.slots.length > 0,
  );

  return firstWorkingDayIndex >= 0 ? firstWorkingDayIndex : 0;
}
