"use client";

import { X } from "lucide-react";

import {
  buildCapacityDots,
  CapacityDot,
  PendingRequestsBadge,
} from "@/components/reservation/create-reservation/capacity-indicators";
import {
  formatPersianHour,
  formatPersianHourRangeAriaLabel,
  formatPersianHourRangeTooltip,
  formatPersianNumber,
  formatPersianShortHourRange,
} from "@/components/reservation/create-reservation/formatters";
import {
  buildSlotAriaLabel,
  getCellState,
  getMobileSlotStatusBadgeLabel,
  getMobileSlotStatusLabel,
  getMobileSlotToneClass,
  isMobileSlotSelectable,
  isSelectionEnd,
  isSelectionStart,
  selectionContainsHour,
} from "@/components/reservation/create-reservation/slot-helpers";
import { SlotDetailsPopover } from "@/components/reservation/create-reservation/slot-details-popover";
import type {
  MobileSelectionHandle,
  Selection,
  WeekDay,
} from "@/components/reservation/create-reservation/types";
import { cn } from "@/lib/utils";

export function MobileDayView({
  clearSelection,
  mobileDraggingHandle,
  onDaySelect,
  onOpenReasonDialog,
  onSelectSingleHour,
  selectedHours,
  selectedMobileDay,
  selectedMobileDayIndex,
  selection,
  selectionError,
  setMobileDraggingHandle,
  todayDateParam,
  updateMobileSelectionFromPoint,
  weekDays,
}: {
  clearSelection: () => void;
  mobileDraggingHandle: MobileSelectionHandle | null;
  onDaySelect: (dayIndex: number) => void;
  onOpenReasonDialog: () => void;
  onSelectSingleHour: (dayIndex: number, hour: number) => void;
  selectedHours: number;
  selectedMobileDay: WeekDay | null;
  selectedMobileDayIndex: number;
  selection: Selection | null;
  selectionError: string | null;
  setMobileDraggingHandle: (handle: MobileSelectionHandle | null) => void;
  todayDateParam: string;
  updateMobileSelectionFromPoint: (
    handle: MobileSelectionHandle,
    clientX: number,
    clientY: number,
  ) => void;
  weekDays: WeekDay[];
}) {
  const isSelectionBlocked = Boolean(selectionError);

  return (
    <>
      <div
        className={cn(
          "grid gap-3 md:hidden",
          selection &&
            selection.dayIndex === selectedMobileDayIndex &&
            "pb-36",
        )}
        dir="rtl"
      >
        <div
          aria-label="انتخاب روز هفته"
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          dir="ltr"
          role="tablist"
        >
          {weekDays.map((day, dayIndex) => {
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
                key={day.dateParam}
                onClick={() => onDaySelect(dayIndex)}
                dir="rtl"
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

        {selectedMobileDay ? (
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
                برای این روز بازه زمانی قابل رزرو وجود ندارد.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-background shadow-sm">
                {selectedMobileDay.slots.map((slot) => {
                  const hour = slot.slotStartHour;
                  const cell = getCellState(selectedMobileDay, hour);
                  const isSelected = selectionContainsHour(
                    selection,
                    selectedMobileDayIndex,
                    hour,
                  );
                  const startsSelection = isSelectionStart(
                    selection,
                    selectedMobileDayIndex,
                    hour,
                  );
                  const endsSelection = isSelectionEnd(
                    selection,
                    selectedMobileDayIndex,
                    hour,
                  );
                  const slotLabel = buildSlotAriaLabel(
                    selectedMobileDay,
                    hour,
                    cell,
                  );
                  const timeLabel = formatPersianShortHourRange(
                    slot.slotStartHour,
                    slot.slotEndHour,
                  );
                  const timeTooltip = formatPersianHourRangeTooltip(
                    slot.slotStartHour,
                    slot.slotEndHour,
                  );
                  const timeAriaLabel = formatPersianHourRangeAriaLabel(
                    slot.slotStartHour,
                    slot.slotEndHour,
                  );
                  const mobileStatusLabel = getMobileSlotStatusLabel(cell);
                  const mobileStatusBadgeLabel =
                    getMobileSlotStatusBadgeLabel(cell);

                  return (
                    <SlotDetailsPopover
                      cell={cell}
                      isDragging={Boolean(mobileDraggingHandle)}
                      key={`${selectedMobileDay.dateParam}-${hour}`}
                    >
                      <div
                        aria-disabled={!isMobileSlotSelectable(cell)}
                        aria-label={slotLabel}
                        aria-pressed={isSelected}
                        className={cn(
                          "relative flex w-full items-stretch border-b border-slate-100 text-right transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          mobileStatusLabel || isSelected
                            ? "min-h-[68px]"
                            : "min-h-14",
                          getMobileSlotToneClass(cell),
                          (cell.myReservationStatus === "PENDING" ||
                            cell.myReservationStatus ===
                              "ALTERNATIVE_PROPOSED") &&
                            "border-amber-300/30",
                          isMobileSlotSelectable(cell) &&
                            "hover:bg-emerald-50/70",
                          !isMobileSlotSelectable(cell) &&
                            "cursor-not-allowed text-slate-500",
                          isSelected &&
                            "z-10 border-x border-sky-500 bg-sky-100 text-sky-950 shadow-sm",
                          isSelected &&
                            startsSelection &&
                            "border-t border-sky-500",
                          isSelected &&
                            endsSelection &&
                            "border-b border-sky-500",
                          startsSelection && "rounded-t-md",
                          endsSelection && "rounded-b-md",
                          selectionError &&
                            isSelected &&
                            "border-red-500 bg-red-50 text-red-950",
                        )}
                        data-hour={hour}
                        data-mobile-calendar-slot="true"
                        dir="ltr"
                        onClick={() => {
                          if (isSelected && !mobileDraggingHandle) {
                            onOpenReasonDialog();
                            return;
                          }

                          if (!isMobileSlotSelectable(cell)) {
                            return;
                          }

                          onSelectSingleHour(selectedMobileDayIndex, hour);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") {
                            return;
                          }

                          event.preventDefault();

                          if (isSelected) {
                            onOpenReasonDialog();
                            return;
                          }

                          if (isMobileSlotSelectable(cell)) {
                            onSelectSingleHour(selectedMobileDayIndex, hour);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex w-[72px] shrink-0 items-center justify-center border-r border-slate-100 bg-slate-50/60 px-2 py-2 text-sm font-semibold text-slate-700">
                          <span
                            aria-label={timeAriaLabel}
                            className="[unicode-bidi:isolate]"
                            dir="ltr"
                            title={timeTooltip}
                          >
                            {timeLabel}
                          </span>
                        </div>

                        <div
                          className={cn(
                            "relative flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2",
                            mobileStatusLabel || isSelected
                              ? "items-stretch"
                              : "items-start",
                          )}
                          dir="rtl"
                        >
                          <div className="flex min-h-5 items-center justify-start gap-2">
                            {!isSelected &&
                            cell.isWorkingHour &&
                            cell.unavailableReason !== "past" ? (
                              <span
                                aria-hidden="true"
                                className="flex max-w-28 flex-wrap justify-end gap-1"
                              >
                                {buildCapacityDots(cell).map((tone, index) => (
                                  <CapacityDot
                                    key={`${tone}-${index}`}
                                    tone={tone}
                                  />
                                ))}
                              </span>
                            ) : null}

                            {!isSelected && cell.pendingCount > 0 ? (
                              <PendingRequestsBadge count={cell.pendingCount} />
                            ) : null}

                            {!isSelected && mobileStatusBadgeLabel ? (
                              <span
                                className={cn(
                                  "inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[11px] font-medium leading-none",
                                  cell.myReservationStatus === "APPROVED" &&
                                    "border-sky-200 bg-sky-100/70 text-sky-700",
                                  (cell.myReservationStatus === "PENDING" ||
                                    cell.myReservationStatus ===
                                      "ALTERNATIVE_PROPOSED") &&
                                    "border-amber-200 bg-amber-100/60 text-amber-700",
                                )}
                              >
                                {mobileStatusBadgeLabel}
                              </span>
                            ) : null}
                          </div>

                          {isSelected ? (
                            <>
                              {startsSelection ? (
                                <span
                                  aria-label="تغییر شروع بازه"
                                  className="absolute -top-5 left-1/2 z-20 flex h-11 w-32 -translate-x-1/2 touch-none items-center justify-center rounded-full"
                                  onClick={(event) => event.stopPropagation()}
                                  onPointerDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    event.currentTarget.setPointerCapture(
                                      event.pointerId,
                                    );
                                    setMobileDraggingHandle("start");
                                  }}
                                  onPointerMove={(event) => {
                                    if (mobileDraggingHandle === "start") {
                                      updateMobileSelectionFromPoint(
                                        "start",
                                        event.clientX,
                                        event.clientY,
                                      );
                                    }
                                  }}
                                  onPointerUp={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setMobileDraggingHandle(null);
                                  }}
                                  role="button"
                                  tabIndex={0}
                                >
                                  <span className="h-3 w-20 rounded-full border border-slate-300 bg-white shadow-md ring-1 ring-slate-900/10" />
                                </span>
                              ) : null}

                              {endsSelection ? (
                                <span
                                  aria-label="تغییر پایان بازه"
                                  className="absolute -bottom-5 left-1/2 z-20 flex h-11 w-32 -translate-x-1/2 touch-none items-center justify-center rounded-full"
                                  onClick={(event) => event.stopPropagation()}
                                  onPointerDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    event.currentTarget.setPointerCapture(
                                      event.pointerId,
                                    );
                                    setMobileDraggingHandle("end");
                                  }}
                                  onPointerMove={(event) => {
                                    if (mobileDraggingHandle === "end") {
                                      updateMobileSelectionFromPoint(
                                        "end",
                                        event.clientX,
                                        event.clientY,
                                      );
                                    }
                                  }}
                                  onPointerUp={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setMobileDraggingHandle(null);
                                  }}
                                  role="button"
                                  tabIndex={0}
                                >
                                  <span className="h-3 w-20 rounded-full border border-slate-300 bg-white shadow-md ring-1 ring-slate-900/10" />
                                </span>
                              ) : null}

                              {startsSelection && selection ? (
                                <span
                                  className={cn(
                                    "inline-flex rounded-md border bg-white/90 px-2 py-1 text-sm font-semibold shadow-sm",
                                    selectionError
                                      ? "border-red-200 text-red-800"
                                      : "border-sky-200 text-sky-900",
                                  )}
                                >
                                  {formatPersianHour(selection.startHour)} تا{" "}
                                  {formatPersianHour(selection.endHour)}
                                </span>
                              ) : null}
                            </>
                          ) : mobileStatusLabel ? (
                            <span className="grid min-w-0 gap-1">
                              <span
                                className={cn(
                                  "text-[13px] font-medium leading-5",
                                  cell.myReservationStatus === "APPROVED" &&
                                    "text-sky-700",
                                  (cell.myReservationStatus === "PENDING" ||
                                    cell.myReservationStatus ===
                                      "ALTERNATIVE_PROPOSED") &&
                                    "text-amber-700",
                                  !cell.myReservationStatus && "text-slate-500",
                                )}
                              >
                                {mobileStatusLabel}
                              </span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </SlotDetailsPopover>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {selection && selection.dayIndex === selectedMobileDayIndex ? (
        <div
          className={cn(
            "sticky bottom-0 z-40 -mx-5 grid gap-3 border-t border-sky-200 bg-sky-50/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur md:hidden",
            isSelectionBlocked && "border-red-200 bg-red-50/95",
          )}
          dir="rtl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-right">
              <p
                className={cn(
                  "text-sm font-semibold",
                  isSelectionBlocked ? "text-red-950" : "text-sky-950",
                )}
              >
                {formatPersianHour(selection.startHour)} تا{" "}
                {formatPersianHour(selection.endHour)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                مدت انتخاب‌شده: {formatPersianNumber(selectedHours)} ساعت
              </p>
            </div>
            <button
              aria-label="لغو انتخاب بازه"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={clearSelection}
              type="button"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          {selectionError ? (
            <p
              className="rounded-md border border-red-200 bg-white/80 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              {selectionError}
            </p>
          ) : null}

          <button
            aria-label="تکمیل درخواست رزرو برای بازه انتخاب‌شده"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSelectionBlocked}
            onClick={onOpenReasonDialog}
            type="button"
          >
            تکمیل درخواست رزرو
          </button>
        </div>
      ) : null}
    </>
  );
}
