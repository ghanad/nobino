"use client";

import {
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { CapacityDot, buildCapacityDots } from "./capacity-dots";
import { formatPersianShortHourRange } from "./formatting";
import { MobileReservationBlock } from "./mobile-reservation-block";
import {
  buildMobileSlotAriaLabel,
  getMobileSlotStatusLabel,
  getMobileSlotToneClass,
} from "./mobile-slot-helpers";
import { PendingRequestsBadge } from "./pending-requests-badge";
import { getPositionedReservationBlocks } from "./reservation-block-helpers";
import type {
  ManagerWeekDay,
  PositionedReservationBlock,
  ResizingReservation,
  ResizeEdge,
} from "./types";
import { cn } from "@/lib/utils";

export function MobileManagerWeekView({
  localWeekDays,
  resizeOverSlotKey,
  resizingReservation,
  selectedMobileDayIndex,
  setSelectedMobileDayIndex,
  todayDateParam,
  onResizeStart,
}: {
  localWeekDays: ManagerWeekDay[];
  resizeOverSlotKey: string | null;
  resizingReservation: ResizingReservation | null;
  selectedMobileDayIndex: number;
  setSelectedMobileDayIndex: Dispatch<SetStateAction<number>>;
  todayDateParam: string;
  onResizeStart: (
    event: ReactPointerEvent<HTMLElement>,
    resizeBlock: PositionedReservationBlock,
    edge: ResizeEdge,
    dateParam: string,
  ) => void;
}) {
  const mobileDayTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mobileDayTabsContainerRef = useRef<HTMLDivElement | null>(null);
  const mobileDayKey = localWeekDays.map((day) => day.dateParam).join("|");
  const selectedMobileDay =
    localWeekDays[selectedMobileDayIndex] ?? localWeekDays[0] ?? null;

  useEffect(() => {
    const container = mobileDayTabsContainerRef.current;
    const selectedTab = mobileDayTabRefs.current[selectedMobileDayIndex];

    if (!container || !selectedTab) {
      return;
    }

    const nextScrollLeft =
      selectedTab.offsetLeft -
      (container.clientWidth - selectedTab.offsetWidth) / 2;

    container.scrollTo({
      left: Math.max(nextScrollLeft, 0),
      behavior: "auto",
    });
  }, [mobileDayKey, selectedMobileDayIndex]);

  if (!selectedMobileDay) {
    return null;
  }

  return (
    <div className="mt-5 grid gap-3 sm:hidden" dir="rtl">
      <div
        aria-label="انتخاب روز هفته"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        dir="ltr"
        ref={mobileDayTabsContainerRef}
        role="tablist"
      >
        {localWeekDays.map((day, dayIndex) => {
          const isSelected = dayIndex === selectedMobileDayIndex;
          const isToday = day.dateParam === todayDateParam;

          return (
            <button
              aria-current={isToday ? "date" : undefined}
              aria-selected={isSelected}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-md border bg-background px-3 text-sm font-medium text-slate-700 transition-colors",
                isSelected &&
                  "border-primary bg-primary text-primary-foreground",
                !isSelected && "hover:bg-accent",
                day.closedReason && !isSelected && "text-slate-500",
              )}
              dir="rtl"
              key={day.dateParam}
              onClick={() => setSelectedMobileDayIndex(dayIndex)}
              ref={(element) => {
                mobileDayTabRefs.current[dayIndex] = element;
              }}
              role="tab"
              type="button"
            >
              <span>{day.shortLabel}</span>
              {isToday ? (
                <span
                  className={cn(
                    "rounded-sm px-1 py-0.5 text-[10px] font-semibold",
                    isSelected
                      ? "bg-primary-foreground/15 text-primary-foreground"
                      : "bg-sky-50 text-sky-700",
                  )}
                >
                  امروز
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-right">
          <h3 className="text-sm font-semibold">{selectedMobileDay.dateLabel}</h3>
          {selectedMobileDay.closedReason ? (
            <p className="mt-1 text-xs text-red-700">
              {selectedMobileDay.closedReason}
            </p>
          ) : null}
        </div>

        {selectedMobileDay.slots.length === 0 ? (
          <p className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
            برای این روز بازه ساعت کاری وجود ندارد.
          </p>
        ) : (
          <div
            className="grid overflow-hidden rounded-lg border border-slate-200 bg-background shadow-sm"
            dir="ltr"
            style={{
              gridTemplateColumns: "72px minmax(0,1fr)",
              gridTemplateRows: `repeat(${selectedMobileDay.slots.length}, minmax(72px, auto))`,
            }}
          >
            {selectedMobileDay.slots.map((slot, slotIndex) => {
              const timeLabel = formatPersianShortHourRange(
                slot.slotStartHour,
                slot.slotEndHour,
              );

              return (
                <div
                  className="flex items-center justify-center border-b border-r border-slate-100 bg-slate-50/60 px-2 py-2 text-sm font-semibold text-slate-700 last:border-b-0"
                  key={`mobile-time-${selectedMobileDay.dateParam}-${slot.slotStartHour}`}
                  style={{
                    gridColumn: 1,
                    gridRow: slotIndex + 1,
                  }}
                >
                  <span className="[unicode-bidi:isolate]" dir="ltr">
                    {timeLabel}
                  </span>
                </div>
              );
            })}

            {selectedMobileDay.slots.map((slot, slotIndex) => (
              <div
                aria-label={buildMobileSlotAriaLabel(selectedMobileDay, slot)}
                className={cn(
                  "relative flex min-h-[72px] items-center justify-between gap-3 border-b px-3 py-2 text-right last:border-b-0",
                  getMobileSlotToneClass(slot),
                  resizeOverSlotKey ===
                    `${selectedMobileDay.dateParam}-${slot.slotStartHour}-start` ||
                    resizeOverSlotKey ===
                      `${selectedMobileDay.dateParam}-${slot.slotStartHour}-end`
                    ? "outline outline-2 outline-amber-600 outline-offset-[-2px]"
                    : null,
                )}
                data-date-param={selectedMobileDay.dateParam}
                data-manager-calendar-cell="true"
                data-slot-end-hour={slot.slotEndHour}
                data-slot-start-hour={slot.slotStartHour}
                dir="rtl"
                key={`mobile-slot-${selectedMobileDay.dateParam}-${slot.slotStartHour}`}
                style={{
                  gridColumn: 2,
                  gridRow: slotIndex + 1,
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="flex max-w-28 flex-wrap justify-end gap-1"
                  >
                    {buildCapacityDots(slot).map((tone, index) => (
                      <CapacityDot key={`${tone}-${index}`} tone={tone} />
                    ))}
                  </span>
                  <PendingRequestsBadge count={slot.pendingCount} />
                </div>
                <span className="text-xs font-medium text-slate-600">
                  {getMobileSlotStatusLabel(slot)}
                </span>
              </div>
            ))}

            {getPositionedReservationBlocks(selectedMobileDay).map((block) => {
              const startIndex = selectedMobileDay.slots.findIndex(
                (slot) => slot.slotStartHour === block.startHour,
              );
              const endIndexExclusive = selectedMobileDay.slots.findIndex(
                (slot) => slot.slotStartHour >= block.endHour,
              );
              const endLine =
                endIndexExclusive >= 0
                  ? endIndexExclusive + 1
                  : selectedMobileDay.slots.length + 1;

              if (startIndex < 0 || endLine <= startIndex + 1) {
                return null;
              }

              return (
                <div
                  className="pointer-events-none z-10 p-2"
                  key={`mobile-block-${selectedMobileDay.dateParam}-${block.detail.id}`}
                  style={{
                    gridColumn: 2,
                    gridRow: `${startIndex + 1} / ${endLine}`,
                  }}
                >
                  <MobileReservationBlock
                    block={block}
                    isResizing={
                      resizingReservation?.reservationId === block.detail.id
                    }
                    onResizeStart={(event, resizeBlock, edge) => {
                      onResizeStart(
                        event,
                        resizeBlock,
                        edge,
                        selectedMobileDay.dateParam,
                      );
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
