export type DeskLayoutEntry = {
  deskClass: string;
  orientation: "horizontal" | "vertical";
  slot: number;
};

const OFFICE_LAYOUT_SLOTS = [
  { deskClass: "left-[8%] top-[2%] h-[4%] w-[18%]", orientation: "horizontal" },
  { deskClass: "left-[31%] top-[2%] h-[4%] w-[18%]", orientation: "horizontal" },
  { deskClass: "left-[54%] top-[2%] h-[4%] w-[18%]", orientation: "horizontal" },
  { deskClass: "right-[2%] top-[2%] h-[4%] w-[18%]", orientation: "horizontal" },
  { deskClass: "right-[2%] top-[13%] h-[4%] w-[18%]", orientation: "horizontal" },
  { deskClass: "right-[2%] top-[20%] h-[12%] w-[6%]", orientation: "vertical" },
  { deskClass: "right-[2%] top-[33.5%] h-[12%] w-[6%]", orientation: "vertical" },
  { deskClass: "right-[2%] top-[60.5%] h-[12%] w-[6%]", orientation: "vertical" },
  { deskClass: "right-[2%] top-[74%] h-[12%] w-[6%]", orientation: "vertical" },
  { deskClass: "right-[2%] top-[87.5%] h-[11%] w-[6%]", orientation: "vertical" },
  { deskClass: "left-[30%] top-[74.5%] h-[12%] w-[6%]", orientation: "vertical" },
  { deskClass: "left-[30%] top-[60.5%] h-[12%] w-[6%]", orientation: "vertical" },
  { deskClass: "left-[9%] top-[13%] h-[4%] w-[18%]", orientation: "horizontal" },
  { deskClass: "left-[29%] top-[13%] h-[4%] w-[18%]", orientation: "horizontal" },
  { deskClass: "left-[8%] top-[37%] h-[4%] w-[18%]", orientation: "horizontal" },
  { deskClass: "left-[28%] top-[37%] h-[4%] w-[18%]", orientation: "horizontal" },
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
