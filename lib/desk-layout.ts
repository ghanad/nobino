export type DeskLayoutEntry = {
  columnClass: string;
  neighbourIds: string[];
  slot: number;
};

const OFFICE_LAYOUT_SLOTS = [
  "",
  "",
  "col-start-4",
  "",
  "col-start-1",
  "",
  "col-start-4",
  "",
  "col-start-1",
  "",
] as const;

/** Keeps physical placement separate from desk records while preserving stable ID lookups. */
export function buildDeskLayout(deskIds: string[]): Record<string, DeskLayoutEntry> {
  return Object.fromEntries(deskIds.map((deskId, slot) => {
    const pairedSlot = slot % 2 === 0 ? slot + 1 : slot - 1;
    const neighbourId = deskIds[pairedSlot];
    return [deskId, {
      columnClass: OFFICE_LAYOUT_SLOTS[slot] ?? "",
      neighbourIds: neighbourId ? [neighbourId] : [],
      slot,
    }];
  }));
}
