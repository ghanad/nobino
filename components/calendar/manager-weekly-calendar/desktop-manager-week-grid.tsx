"use client";

import {
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { CapacityDots } from "./capacity-dots";
import { formatPersianNumber, formatPersianShortHourRange } from "./formatting";
import { PendingRequestsBadge } from "./pending-requests-badge";
import { ReservationBlock } from "./reservation-block";
import { getCellTone, getSlotForHour } from "./calendar-helpers";
import type {
  DraggedReservation,
  ManagerWeekDay,
  ManagerWeekSlot,
  PositionedReservationBlock,
  ResizingReservation,
  ResizeEdge,
} from "./types";
import { cn } from "@/lib/utils";

export function DesktopManagerWeekGrid({
  draggedReservation,
  dragOverSlotKey,
  firstHour,
  hours,
  isDropPending,
  localWeekDays,
  resizeOverSlotKey,
  resizingReservation,
  reservationBlocksByDate,
  onDragEnd,
  onDragStart,
  onDrop,
  onResizeStart,
  onSetDragOverSlotKey,
}: {
  draggedReservation: DraggedReservation | null;
  dragOverSlotKey: string | null;
  firstHour: number;
  hours: number[];
  isDropPending: boolean;
  localWeekDays: ManagerWeekDay[];
  resizeOverSlotKey: string | null;
  resizingReservation: ResizingReservation | null;
  reservationBlocksByDate: Map<string, PositionedReservationBlock[]>;
  onDragEnd: () => void;
  onDragStart: (dragBlock: PositionedReservationBlock) => void;
  onDrop: (
    event: DragEvent<HTMLDivElement>,
    day: ManagerWeekDay,
    slot: ManagerWeekSlot | null,
  ) => void;
  onResizeStart: (
    event: ReactPointerEvent<HTMLElement>,
    resizeBlock: PositionedReservationBlock,
    edge: ResizeEdge,
    dateParam: string,
  ) => void;
  onSetDragOverSlotKey: (value: string | null) => void;
}) {
  return (
    <div
      className="mt-5 hidden overflow-hidden rounded-lg border bg-background shadow-sm sm:block"
      dir="ltr"
    >
      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <div>
            <div className="sticky top-0 z-20 grid grid-cols-[64px_repeat(7,minmax(124px,1fr))] border-b bg-slate-50/80">
              <div className="border-r px-3 py-3 text-center text-sm font-semibold text-slate-500" dir="rtl">
                ساعت
              </div>
              {localWeekDays.map((day) => (
                <div
                  className="border-r px-3 py-3 text-center text-sm font-semibold last:border-r-0"
                  key={day.dateParam}
                  title={day.dateLabel}
                  dir="rtl"
                >
                  <span>{day.shortLabel}</span>
                  {day.closedReason ? (
                    <span className="mt-1 block text-[11px] font-medium leading-4 text-red-700">
                      {day.closedReason}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            <div
              className="grid grid-cols-[64px_repeat(7,minmax(124px,1fr))]"
              style={{
                gridTemplateRows: `repeat(${hours.length}, minmax(5.75rem, auto))`,
              }}
            >
              {hours.map((hour, hourIndex) => (
                <div
                  className="relative border-b border-r bg-slate-50/80"
                  key={`time-${hour}`}
                  style={{ gridColumn: 1, gridRow: hourIndex + 1 }}
                >
                  <span
                    className="absolute inset-x-1 top-1/2 -translate-y-1/2 text-center text-xs font-medium text-slate-500"
                    dir="ltr"
                  >
                    {formatPersianShortHourRange(hour, hour + 1)}
                  </span>
                </div>
              ))}

              {hours.map((hour, hourIndex) =>
                localWeekDays.map((day, dayIndex) => {
                  const slot = getSlotForHour(day, hour);
                  const available = slot
                    ? Math.max(slot.capacity - slot.approvedCount, 0)
                    : 0;

                  return (
                    <div
                      className={cn(
                        "relative border-b border-r text-left transition-colors",
                        getCellTone(slot),
                        draggedReservation && slot ? "outline-offset-[-2px]" : null,
                        dragOverSlotKey === `${day.dateParam}-${hour}`
                          ? "outline outline-2 outline-sky-500"
                          : null,
                        resizeOverSlotKey ===
                          `${day.dateParam}-${hour}-start` ||
                          resizeOverSlotKey === `${day.dateParam}-${hour}-end`
                          ? "outline outline-2 outline-amber-600"
                          : null,
                      )}
                      data-date-param={day.dateParam}
                      data-manager-calendar-cell="true"
                      data-slot-end-hour={slot?.slotEndHour}
                      data-slot-start-hour={slot?.slotStartHour}
                      onDragLeave={() => onSetDragOverSlotKey(null)}
                      onDragOver={(event) => {
                        if (!slot || !draggedReservation || isDropPending) {
                          return;
                        }

                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        onSetDragOverSlotKey(`${day.dateParam}-${hour}`);
                      }}
                      onDrop={(event) => onDrop(event, day, slot)}
                      key={`${day.dateParam}-${hour}`}
                      style={{
                        gridColumn: dayIndex + 2,
                        gridRow: hourIndex + 1,
                      }}
                    >
                      {slot ? (
                        <>
                          <CapacityDots slot={slot} />
                          <PendingRequestsBadge
                            className="absolute left-2 top-2 z-10"
                            count={slot.pendingCount}
                          />
                          <span className="sr-only">
                            {`ظرفیت آزاد ${formatPersianNumber(
                              available,
                            )} از ${formatPersianNumber(slot.capacity)}، ${formatPersianNumber(
                              slot.approvedCount,
                            )} رزرو تاییدشده، ${formatPersianNumber(
                              slot.pendingCount,
                            )} درخواست در انتظار`}
                          </span>
                        </>
                      ) : (
                        <span className="sr-only">ساعت غیرکاری</span>
                      )}
                    </div>
                  );
                }),
              )}

              {localWeekDays.flatMap((day, dayIndex) =>
                (reservationBlocksByDate.get(day.dateParam) ?? []).map((block) => {
                  const startLine = block.startHour - firstHour + 1;
                  const endLine = block.endHour - firstHour + 1;

                  return (
                    <div
                      className="pointer-events-none z-10 p-2 hover:z-30 focus-within:z-30"
                      key={`${day.dateParam}-${block.detail.id}`}
                      style={{
                        gridColumn: dayIndex + 2,
                        gridRow: `${startLine} / ${endLine}`,
                      }}
                    >
                      <ReservationBlock
                        block={block}
                        isDragging={
                          draggedReservation?.reservationId === block.detail.id
                        }
                        isResizing={
                          resizingReservation?.reservationId === block.detail.id
                        }
                        onDragEnd={onDragEnd}
                        onDragStart={onDragStart}
                        onResizeStart={(event, resizeBlock, edge) => {
                          onResizeStart(event, resizeBlock, edge, day.dateParam);
                        }}
                      />
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
