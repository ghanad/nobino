import type { ManagerWeekDay } from "./types";

export function applyReservationTimeUpdate(
  weekDays: ManagerWeekDay[],
  input: {
    dateParam: string;
    proposedEndHour: number;
    proposedStartHour: number;
    reservationId: string;
  },
): ManagerWeekDay[] {
  const existingDetail = weekDays
    .flatMap((day) => day.slots)
    .flatMap((slot) => slot.details)
    .find((detail) => detail.id === input.reservationId);

  if (!existingDetail) {
    return weekDays;
  }

  return weekDays.map((day) => ({
    ...day,
    slots: day.slots.map((slot) => {
      const hadReservation = slot.details.some(
        (detail) => detail.id === input.reservationId,
      );
      const shouldHaveReservation =
        day.dateParam === input.dateParam &&
        slot.slotStartHour < input.proposedEndHour &&
        slot.slotEndHour > input.proposedStartHour;

      if (hadReservation === shouldHaveReservation) {
        return slot;
      }

      const countDelta = shouldHaveReservation ? 1 : -1;

      return {
        ...slot,
        approvedCount:
          existingDetail.status === "APPROVED"
            ? slot.approvedCount + countDelta
            : slot.approvedCount,
        pendingCount:
          existingDetail.status === "PENDING"
            ? slot.pendingCount + countDelta
            : slot.pendingCount,
        details: shouldHaveReservation
          ? [...slot.details, existingDetail]
          : slot.details.filter((detail) => detail.id !== input.reservationId),
      };
    }),
  }));
}
