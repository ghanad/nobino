export type DeskLayoutEntry = {
  deskClass: string;
  orientation: "horizontal" | "vertical";
  slot: number;
};

const OFFICE_LAYOUT_SLOTS = [
  { deskClass: "left-[8%] top-[2%] h-[7%] w-[18%]", orientation: "horizontal" },
  { deskClass: "left-[31%] top-[2%] h-[7%] w-[18%]", orientation: "horizontal" },
  { deskClass: "left-[54%] top-[2%] h-[7%] w-[18%]", orientation: "horizontal" },
  { deskClass: "right-[2%] top-[2%] h-[7%] w-[18%]", orientation: "horizontal" },
  { deskClass: "right-[2%] top-[17%] h-[7%] w-[17%]", orientation: "horizontal" },
  { deskClass: "right-[2%] top-[27%] h-[11%] w-[8%]", orientation: "vertical" },
  { deskClass: "right-[2%] top-[40%] h-[11%] w-[8%]", orientation: "vertical" },
  { deskClass: "right-[2%] top-[67%] h-[10%] w-[8%]", orientation: "vertical" },
  { deskClass: "right-[2%] top-[78%] h-[10%] w-[8%]", orientation: "vertical" },
  { deskClass: "right-[2%] top-[89%] h-[10%] w-[8%]", orientation: "vertical" },
  { deskClass: "left-[2%] top-[77%] h-[11%] w-[8%]", orientation: "vertical" },
  { deskClass: "left-[2%] top-[62%] h-[12%] w-[8%]", orientation: "vertical" },
  { deskClass: "left-[9%] top-[17%] h-[7%] w-[18%]", orientation: "horizontal" },
  { deskClass: "left-[29%] top-[17%] h-[7%] w-[18%]", orientation: "horizontal" },
  { deskClass: "left-[8%] top-[43%] h-[7%] w-[18%]", orientation: "horizontal" },
  { deskClass: "left-[28%] top-[43%] h-[7%] w-[18%]", orientation: "horizontal" },
] as const;

/** Maps ordered desk records to their fixed positions in the office floor plan. */
export function buildDeskLayout(deskIds: string[]): Record<string, DeskLayoutEntry> {
  return Object.fromEntries(deskIds.map((deskId, slot) => {
    const placement = OFFICE_LAYOUT_SLOTS[slot];
    return [deskId, {
      deskClass: placement?.deskClass ?? "left-1/2 top-1/2 h-[7%] w-[18%]",
      orientation: placement?.orientation ?? "horizontal",
      slot,
    }];
  }));
}
