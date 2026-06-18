import { cn } from "@/lib/utils";

import type { ManagerWeekSlot } from "./types";

type CapacityDotTone = "approved" | "free";

export function buildCapacityDots(slot: ManagerWeekSlot): CapacityDotTone[] {
  const capacity = Math.max(slot.capacity, 0);
  const approvedCount = Math.min(slot.approvedCount, capacity);
  const freeCount = Math.max(capacity - approvedCount, 0);

  return [
    ...Array<CapacityDotTone>(freeCount).fill("free"),
    ...Array<CapacityDotTone>(approvedCount).fill("approved"),
  ];
}

function getCapacityDotClass(tone: CapacityDotTone): string {
  if (tone === "approved") {
    return "border-slate-400 bg-slate-300";
  }

  return "border-emerald-600 bg-emerald-500";
}

export function CapacityDot({ tone }: { tone: CapacityDotTone }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "h-2 w-2 shrink-0 rounded-full border shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]",
        getCapacityDotClass(tone),
      )}
    />
  );
}

export function CapacityDots({ slot }: { slot: ManagerWeekSlot }) {
  const dots = buildCapacityDots(slot);

  return (
    <span className="absolute inset-x-2 top-1/2 z-10 flex -translate-y-1/2 flex-wrap items-center justify-center gap-1.5">
      {dots.map((tone, index) => (
        <CapacityDot key={`${tone}-${index}`} tone={tone} />
      ))}
    </span>
  );
}
