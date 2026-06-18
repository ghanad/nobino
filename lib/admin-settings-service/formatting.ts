import { formatJalaliDateTime } from "@/lib/jalali-date";

import type { BlockingSlot } from "./capacity-reduction";

export function formatBlockingSlots(blocks: BlockingSlot[]): string {
  return blocks
    .slice(0, 5)
    .map((slot) => `${formatJalaliDateTime(slot.slotStart)} (${slot.count})`)
    .join(", ");
}
