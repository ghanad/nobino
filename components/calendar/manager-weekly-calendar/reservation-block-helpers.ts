import type {
  ManagerWeekDay,
  PositionedReservationBlock,
  SlotReservationBlock,
  SlotReservationDetail,
} from "./types";

export function getDetailClass(status: SlotReservationDetail["status"]): string {
  if (status === "APPROVED") {
    return "bg-emerald-100 text-emerald-900 ring-emerald-200";
  }

  if (status === "ALTERNATIVE_PROPOSED") {
    return "bg-sky-100 text-sky-900 ring-sky-300";
  }

  return "bg-amber-100 text-amber-950 ring-amber-300";
}

export function canUpdateReservationTime(
  status: SlotReservationDetail["status"],
): boolean {
  return (
    status === "PENDING" ||
    status === "APPROVED" ||
    status === "ALTERNATIVE_PROPOSED"
  );
}

function getReservationBlocks(day: ManagerWeekDay): SlotReservationBlock[] {
  const blocksById = new Map<string, SlotReservationBlock>();

  for (const slot of day.slots) {
    for (const detail of slot.details) {
      const current = blocksById.get(detail.id);

      if (!current) {
        blocksById.set(detail.id, {
          detail,
          startHour: slot.slotStartHour,
          endHour: slot.slotEndHour,
        });
        continue;
      }

      current.startHour = Math.min(current.startHour, slot.slotStartHour);
      current.endHour = Math.max(current.endHour, slot.slotEndHour);
    }
  }

  return Array.from(blocksById.values());
}

export function getPositionedReservationBlocks(
  day: ManagerWeekDay,
): PositionedReservationBlock[] {
  const blocks = getReservationBlocks(day).sort(
    (left, right) =>
      left.startHour - right.startHour || left.endHour - right.endHour,
  );
  const laneEndHours: number[] = [];
  const positionedBlocks = blocks.map((block) => {
    const availableLane = laneEndHours.findIndex(
      (endHour) => endHour <= block.startHour,
    );
    const lane = availableLane >= 0 ? availableLane : laneEndHours.length;
    laneEndHours[lane] = block.endHour;

    return {
      ...block,
      lane,
      laneCount: 1,
    };
  });
  const laneCount = Math.max(laneEndHours.length, 1);

  return positionedBlocks.map((block) => ({
    ...block,
    laneCount,
  }));
}

function getLaneStyle(block: PositionedReservationBlock) {
  const laneWidth = 100 / block.laneCount;

  return {
    marginLeft: `calc(${block.lane * laneWidth}% + 0.25rem)`,
    width: `calc(${laneWidth}% - 0.5rem)`,
  };
}

export function getReservationBlockStyle(block: PositionedReservationBlock) {
  return getLaneStyle(block);
}

export function getMobileReservationBlockStyle(
  block: PositionedReservationBlock,
) {
  return getLaneStyle(block);
}
