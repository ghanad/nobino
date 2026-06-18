"use client";

import { Hourglass } from "lucide-react";

import { formatPersianNumber } from "@/components/reservation/create-reservation/formatters";
import type {
  CapacityDotTone,
  CellState,
} from "@/components/reservation/create-reservation/types";
import { cn } from "@/lib/utils";

export function buildCapacityDots(cell: CellState): CapacityDotTone[] {
  if (cell.unavailableReason === "past") {
    return [];
  }

  const capacity = Math.max(cell.capacity, 0);
  const myApprovedCount =
    cell.myReservationStatus === "APPROVED" ? Math.min(1, capacity) : 0;
  const approvedOtherCount = Math.min(
    Math.max(cell.approvedCount - myApprovedCount, 0),
    Math.max(capacity - myApprovedCount, 0),
  );
  const freeCount = Math.max(
    capacity - myApprovedCount - approvedOtherCount,
    0,
  );

  return [
    ...Array<CapacityDotTone>(myApprovedCount).fill("mine"),
    ...Array<CapacityDotTone>(freeCount).fill("free"),
    ...Array<CapacityDotTone>(approvedOtherCount).fill("approved"),
  ];
}

function getCapacityDotClass(tone: CapacityDotTone): string {
  if (tone === "mine") {
    return "border-sky-600 bg-sky-500";
  }

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

export function CapacityDots({ cell }: { cell: CellState }) {
  const dots = buildCapacityDots(cell);

  return (
    <span className="absolute inset-x-2 top-1/2 z-10 flex -translate-y-1/2 flex-wrap items-center justify-center gap-1.5">
      {dots.map((tone, index) => (
        <CapacityDot key={`${tone}-${index}`} tone={tone} />
      ))}
    </span>
  );
}

export function PendingRequestsBadge({
  className,
  count,
}: {
  className?: string;
  count: number;
}) {
  if (count <= 0) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center gap-0.5 rounded-full border border-amber-300 bg-amber-100 px-1.5 text-[10px] font-semibold leading-none text-amber-800 shadow-sm",
        className,
      )}
    >
      <Hourglass className="h-3 w-3" />
      <span>{formatPersianNumber(count)}</span>
    </span>
  );
}

export function CalendarLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm"
      dir="rtl"
    >
      <span className="inline-flex items-center gap-1.5">
        <CapacityDot tone="free" />
        ظرفیت آزاد
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CapacityDot tone="mine" />
        رزرو تاییدشده شما
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CapacityDot tone="approved" />
        رزرو تاییدشده
      </span>
      <span className="inline-flex items-center gap-1.5">
        <PendingRequestsBadge count={1} />
        درخواست در انتظار
      </span>
    </div>
  );
}
