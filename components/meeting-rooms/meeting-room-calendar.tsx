"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";

import type { CreateMeetingRoomReservationActionState } from "@/app/meeting-rooms/actions";
import {
  ActionResultBridge,
  ReservationsActionToast,
} from "@/components/reservation/create-reservation/action-feedback";
import {
  CalendarLegend,
  CapacityDots,
  PendingRequestsBadge,
} from "@/components/reservation/create-reservation/capacity-indicators";
import {
  formatHour,
  formatPersianHour,
  formatPersianHourRangeAriaLabel,
  formatPersianHourRangeTooltip,
  formatPersianNumber,
  formatPersianShortHourRange,
} from "@/components/reservation/create-reservation/formatters";
import { MobileDayView } from "@/components/reservation/create-reservation/mobile-day-view";
import {
  buildSelection,
  buildSlotAriaLabel,
  getCellState,
  getDefaultSelectedDayIndex,
  getHourRange,
  getSelectionRangeError,
  isSelectionEnd,
  isSelectionStart,
  selectionContainsHour,
} from "@/components/reservation/create-reservation/slot-helpers";
import { SlotDetailsPopover } from "@/components/reservation/create-reservation/slot-details-popover";
import type {
  ActionToast,
  MobileSelectionHandle,
  Selection,
  SelectionSource,
  WeekDay,
} from "@/components/reservation/create-reservation/types";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatJalaliDateParam } from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

type MeetingRoomCalendarProps = {
  action: (
    previousState: CreateMeetingRoomReservationActionState,
    formData: FormData,
  ) => Promise<CreateMeetingRoomReservationActionState>;
  emptyMessage: string;
  nextWeekDateParam: string;
  previousWeekDateParam: string;
  roomId: string;
  roomName: string;
  todayDateParam: string;
  weekDays: WeekDay[];
  weekLabel: string;
};

const initialState: CreateMeetingRoomReservationActionState = {
  message: "",
  status: "idle",
};

function buildMeetingRoomDateHref(roomId: string, dateParam: string): string {
  const params = new URLSearchParams({ date: dateParam, roomId });

  return `/meeting-rooms?${params.toString()}`;
}

function addReservationToWeekDays(
  weekDays: WeekDay[],
  mutation: NonNullable<CreateMeetingRoomReservationActionState["mutation"]>,
): WeekDay[] {
  const startAt = new Date(mutation.startAt);
  const endAt = new Date(mutation.endAt);
  const startHour = startAt.getHours();
  const endHour = endAt.getHours();
  const dateParam = formatJalaliDateParam(startAt);
  const reservation = {
    email: mutation.userEmail,
    id: mutation.reservationId,
    partySize: 1,
    userId: mutation.userId,
    userName: mutation.userName,
  };

  return weekDays.map((day) => {
    if (day.dateParam !== dateParam) {
      return day;
    }

    return {
      ...day,
      slots: day.slots.map((slot) => {
        if (slot.slotStartHour < startHour || slot.slotStartHour >= endHour) {
          return slot;
        }

        if (mutation.status === "APPROVED") {
          return {
            ...slot,
            approvedCount: slot.approvedCount + 1,
            approvedReservations: [
              ...slot.approvedReservations.filter(
                (item) => item.id !== mutation.reservationId,
              ),
              reservation,
            ],
            isRequestable: false,
            myReservationId: mutation.reservationId,
            myReservationStatus: "APPROVED",
            unavailableReason: "full",
          };
        }

        return {
          ...slot,
          myReservationId: mutation.reservationId,
          myReservationStatus: "PENDING",
          pendingCount: slot.pendingCount + 1,
          pendingReservations: [
            ...slot.pendingReservations.filter(
              (item) => item.id !== mutation.reservationId,
            ),
            reservation,
          ],
        };
      }),
    };
  });
}

function MeetingRoomRequestDialog({
  clearSelection,
  isOpen,
  selection,
  setIsDialogOpen,
  weekDays,
}: {
  clearSelection: () => void;
  isOpen: boolean;
  selection: Selection | null;
  setIsDialogOpen: (value: boolean) => void;
  weekDays: WeekDay[];
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-labelledby="meeting-room-request-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      role="dialog"
    >
      <button
        aria-label="بستن فرم درخواست"
        className="absolute inset-0 cursor-default"
        onClick={() => setIsDialogOpen(false)}
        type="button"
      />
      <div className="relative z-10 grid max-h-[92vh] w-full max-w-lg gap-5 overflow-y-auto rounded-t-lg border bg-background p-5 shadow-lg sm:rounded-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-medium" id="meeting-room-request-dialog-title">
              تکمیل درخواست اتاق جلسه
            </h3>
            {selection ? (
              <p className="mt-1 text-sm text-muted-foreground" dir="rtl">
                {weekDays[selection.dayIndex]?.modalDateLabel ?? selection.dateParam}
                ، {formatPersianHour(selection.startHour)} تا{" "}
                {formatPersianHour(selection.endHour)}
              </p>
            ) : null}
          </div>
          <button
            aria-label="بستن فرم درخواست"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setIsDialogOpen(false)}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <label className="grid gap-2 text-sm font-medium">
          <span>
            عنوان یا توضیح کوتاه{" "}
            <span className="text-muted-foreground">(اختیاری)</span>
          </span>
          <textarea
            autoFocus
            className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
            maxLength={120}
            name="title"
            placeholder="مثلاً جلسه برنامه‌ریزی یا توضیح کوتاه جلسه"
          />
        </label>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="inline-flex h-11 w-full items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent sm:h-10 sm:w-auto"
            onClick={() => setIsDialogOpen(false)}
            type="button"
          >
            انصراف
          </button>
          <SubmitButton className="h-11 w-full sm:h-10 sm:w-auto" pendingLabel="در حال ثبت...">
            ثبت درخواست
          </SubmitButton>
        </div>

        <button className="sr-only" onClick={clearSelection} type="button">
          پاک کردن انتخاب
        </button>
      </div>
    </div>
  );
}

export function MeetingRoomCalendar({
  action,
  emptyMessage,
  nextWeekDateParam,
  previousWeekDateParam,
  roomId,
  roomName,
  todayDateParam,
  weekDays,
  weekLabel,
}: MeetingRoomCalendarProps) {
  const [state, formAction] = useActionState(action, initialState);
  const [toast, setToast] = useState<ActionToast | null>(null);
  const [currentWeekDays, setCurrentWeekDays] = useState(weekDays);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectionSource, setSelectionSource] = useState<SelectionSource | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);
  const [mobileDraggingHandle, setMobileDraggingHandle] =
    useState<MobileSelectionHandle | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedMobileDayIndex, setSelectedMobileDayIndex] = useState(() =>
    getDefaultSelectedDayIndex(weekDays, todayDateParam),
  );
  const selectionRef = useRef<Selection | null>(null);
  const hours = useMemo(() => getHourRange(currentWeekDays), [currentWeekDays]);
  const weekKey = weekDays.map((day) => day.dateParam).join("|");
  const defaultMobileDayIndex = useMemo(
    () => getDefaultSelectedDayIndex(weekDays, todayDateParam),
    [todayDateParam, weekDays],
  );
  const isCurrentWeek = useMemo(
    () => currentWeekDays.some((day) => day.dateParam === todayDateParam),
    [currentWeekDays, todayDateParam],
  );
  const selectedMobileDay =
    currentWeekDays[selectedMobileDayIndex] ?? currentWeekDays[0] ?? null;
  const selectedHours = selection ? selection.endHour - selection.startHour : 0;
  const selectionRangeError =
    selectionSource === "mobile"
      ? getSelectionRangeError(currentWeekDays, selection)
      : null;

  const clearSelection = useCallback(() => {
    selectionRef.current = null;
    setSelection(null);
    setSelectionSource(null);
    setMobileDraggingHandle(null);
    setIsDialogOpen(false);
  }, []);

  useEffect(() => {
    setCurrentWeekDays(weekDays);
    selectionRef.current = null;
    setSelection(null);
    setSelectionSource(null);
    setIsDragging(false);
    setMobileDraggingHandle(null);
    setIsDialogOpen(false);
    setSelectedMobileDayIndex(defaultMobileDayIndex);
  }, [defaultMobileDayIndex, weekDays, weekKey]);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDialogOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDialogOpen]);

  const handleActionComplete = useCallback(
    (nextState: CreateMeetingRoomReservationActionState) => {
      if (nextState.status === "error") {
        setToast({
          id: Date.now(),
          message: nextState.message,
          variant: "error",
        });
        return;
      }

      if (nextState.status === "success" && nextState.mutation) {
        setCurrentWeekDays((previous) =>
          addReservationToWeekDays(previous, nextState.mutation!),
        );
        setToast({
          id: Date.now(),
          message: nextState.message,
          variant: "success",
        });
        clearSelection();
      }
    },
    [clearSelection],
  );

  function startSelection(
    dayIndex: number,
    hour: number,
    pointerId: number,
    target: HTMLElement,
  ) {
    if (!getCellState(currentWeekDays[dayIndex], hour).isRequestable) {
      return;
    }

    target.setPointerCapture(pointerId);
    setIsDragging(true);
    setIsDialogOpen(false);
    const nextSelection = buildSelection(currentWeekDays, dayIndex, hour, hour);
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
    setSelectionSource("desktop");
  }

  function updateSelection(dayIndex: number, hour: number) {
    setSelection((current) => {
      if (!current || current.dayIndex !== dayIndex) {
        return current;
      }

      const nextSelection = buildSelection(
        currentWeekDays,
        dayIndex,
        current.anchorHour,
        hour,
      );
      selectionRef.current = nextSelection;
      return nextSelection;
    });
  }

  function finishSelection() {
    if (!isDragging) {
      return;
    }

    setIsDragging(false);

    if (selectionRef.current) {
      setIsDialogOpen(true);
    }
  }

  function updateSelectionFromPoint(clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY);
    const cell = element?.closest<HTMLElement>("[data-calendar-cell='true']");

    if (!cell) {
      return;
    }

    const dayIndex = Number(cell.dataset.dayIndex);
    const hour = Number(cell.dataset.hour);

    if (Number.isNaN(dayIndex) || Number.isNaN(hour)) {
      return;
    }

    updateSelection(dayIndex, hour);
  }

  function selectMobileSingleHour(dayIndex: number, hour: number) {
    const nextSelection = buildSelection(currentWeekDays, dayIndex, hour, hour);

    selectionRef.current = nextSelection;
    setSelection(nextSelection);
    setSelectionSource("mobile");
    setIsDialogOpen(false);
  }

  function openDialogForSelection() {
    if (!selection || selectionRangeError) {
      return;
    }

    setIsDialogOpen(true);
  }

  function updateMobileSelectionFromHour(
    handle: MobileSelectionHandle,
    hour: number,
  ) {
    setSelection((current) => {
      if (!current) {
        return current;
      }

      const day = currentWeekDays[current.dayIndex];

      if (!day || !day.slots.some((slot) => slot.slotStartHour === hour)) {
        return current;
      }

      const nextSelection =
        handle === "start"
          ? {
              ...current,
              anchorHour: Math.min(hour, current.endHour - 1),
              startHour: Math.min(hour, current.endHour - 1),
            }
          : {
              ...current,
              endHour: Math.max(hour + 1, current.startHour + 1),
            };

      selectionRef.current = nextSelection;
      setSelectionSource("mobile");
      return nextSelection;
    });
  }

  function updateMobileSelectionFromPoint(
    handle: MobileSelectionHandle,
    clientX: number,
    clientY: number,
  ) {
    const element = document.elementFromPoint(clientX, clientY);
    const slot = element?.closest<HTMLElement>("[data-mobile-calendar-slot='true']");

    if (!slot) {
      return;
    }

    const hour = Number(slot.dataset.hour);

    if (!Number.isNaN(hour)) {
      updateMobileSelectionFromHour(handle, hour);
    }
  }

  return (
    <>
      <ReservationsActionToast
        onDismiss={() => setToast(null)}
        toast={toast}
      />
      <form action={formAction} className="grid gap-5 rounded-lg border bg-card p-5">
        <ActionResultBridge onComplete={handleActionComplete} state={state} />

        <div className="grid gap-3 rounded-md border bg-muted/30 p-3" dir="rtl">
          <div
            className="hidden grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:grid"
            dir="ltr"
          >
            <Link
              className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
              href={buildMeetingRoomDateHref(roomId, previousWeekDateParam)}
              onClick={clearSelection}
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span dir="rtl">هفته قبل</span>
            </Link>
            <div
              className="grid h-16 content-center justify-items-center gap-1 text-center"
              dir="rtl"
            >
              <p className="text-sm font-medium">{weekLabel}</p>
              <p className="text-xs text-muted-foreground">{roomName}</p>
              {!isCurrentWeek ? (
                <Link
                  className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md bg-sky-50 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-sky-100 hover:text-slate-800"
                  href={buildMeetingRoomDateHref(roomId, todayDateParam)}
                  onClick={() => {
                    setSelectedMobileDayIndex(defaultMobileDayIndex);
                    clearSelection();
                  }}
                >
                  بازگشت به هفته جاری
                </Link>
              ) : null}
            </div>
            <Link
              className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
              href={buildMeetingRoomDateHref(roomId, nextWeekDateParam)}
              onClick={clearSelection}
            >
              <span dir="rtl">هفته بعد</span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
            </Link>
          </div>

          <div className="text-center sm:hidden">
            <p className="text-sm font-medium">{weekLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">{roomName}</p>
          </div>
          <div className="flex items-center gap-2 sm:hidden" dir="ltr">
            <Link
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-2 text-sm font-medium hover:bg-accent"
              href={buildMeetingRoomDateHref(roomId, previousWeekDateParam)}
              onClick={clearSelection}
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span dir="rtl">هفته قبل</span>
            </Link>
            <Link
              className="inline-flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-md border bg-muted/60 px-2 text-sm font-medium hover:bg-accent"
              href={buildMeetingRoomDateHref(roomId, todayDateParam)}
              onClick={() => {
                setSelectedMobileDayIndex(defaultMobileDayIndex);
                clearSelection();
              }}
            >
              امروز
            </Link>
            <Link
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-2 text-sm font-medium hover:bg-accent"
              href={buildMeetingRoomDateHref(roomId, nextWeekDateParam)}
              onClick={clearSelection}
            >
              <span dir="rtl">هفته بعد</span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
            </Link>
          </div>
        </div>

        <CalendarLegend />

        <input name="roomId" type="hidden" value={roomId} />
        <input name="date" type="hidden" value={selection?.dateParam ?? ""} />
        <input name="startHour" type="hidden" value={selection?.startHour ?? ""} />
        <input name="endHour" type="hidden" value={selection?.endHour ?? ""} />

        {hours.length === 0 ? (
          <p className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <>
            <MobileDayView
              clearSelection={clearSelection}
              mobileDraggingHandle={mobileDraggingHandle}
              onDaySelect={(dayIndex) => {
                setSelectedMobileDayIndex(dayIndex);
                clearSelection();
              }}
              onOpenReasonDialog={openDialogForSelection}
              onSelectSingleHour={selectMobileSingleHour}
              selectedHours={selectedHours}
              selectedMobileDay={selectedMobileDay}
              selectedMobileDayIndex={selectedMobileDayIndex}
              selection={selection}
              selectionError={selectionRangeError}
              setMobileDraggingHandle={setMobileDraggingHandle}
              todayDateParam={todayDateParam}
              updateMobileSelectionFromPoint={updateMobileSelectionFromPoint}
              weekDays={currentWeekDays}
            />

            <div
              className="hidden overflow-hidden rounded-lg border border-slate-200 bg-background shadow-sm md:block"
              dir="ltr"
              onPointerLeave={() => setIsDragging(false)}
              onPointerUp={finishSelection}
            >
              <div className="overflow-x-auto">
                <div className="min-w-[920px]">
                  <div className="grid grid-cols-[56px_repeat(7,minmax(116px,1fr))] border-b border-slate-100 bg-slate-50/70">
                    <div className="border-r border-slate-100 px-2 py-3 text-center text-xs font-medium text-muted-foreground">
                      ساعت
                    </div>
                    {currentWeekDays.map((day) => (
                      <div
                        className={cn(
                          "border-r border-slate-100 px-3 py-3 text-center text-sm font-semibold last:border-r-0",
                          day.closedReason && "bg-slate-100/80 text-slate-500",
                        )}
                        dir="rtl"
                        key={day.dateParam}
                        title={
                          day.closedReason
                            ? `${day.dateLabel}، ${day.closedReason}، این روز قابل رزرو نیست`
                            : day.dateLabel
                        }
                      >
                        <span>{day.shortLabel}</span>
                        {day.closedReason ? (
                          <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-4 text-red-600">
                            {day.closedReason}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="max-h-[520px] overflow-y-auto">
                    <div
                      className="grid touch-none select-none grid-cols-[56px_repeat(7,minmax(116px,1fr))]"
                      style={{
                        gridTemplateRows: `repeat(${hours.length}, 3.25rem)`,
                      }}
                    >
                      {hours.map((hour, hourIndex) => {
                        const timeLabel = formatPersianShortHourRange(
                          hour,
                          hour + 1,
                        );
                        const timeTooltip = formatPersianHourRangeTooltip(
                          hour,
                          hour + 1,
                        );
                        const timeAriaLabel = formatPersianHourRangeAriaLabel(
                          hour,
                          hour + 1,
                        );

                        return (
                          <div
                            className="relative border-b border-r border-slate-100 bg-slate-50/40"
                            key={`time-${hour}`}
                            style={{ gridColumn: 1, gridRow: hourIndex + 1 }}
                          >
                            <span
                              aria-label={timeAriaLabel}
                              className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs font-medium text-muted-foreground [unicode-bidi:isolate]"
                              dir="ltr"
                              title={timeTooltip}
                            >
                              {timeLabel}
                            </span>
                          </div>
                        );
                      })}

                      {hours.map((hour, hourIndex) =>
                        currentWeekDays.map((day, dayIndex) => {
                          const cell = getCellState(day, hour);
                          const isSelected = selectionContainsHour(
                            selection,
                            dayIndex,
                            hour,
                          );
                          const startsSelection = isSelectionStart(
                            selection,
                            dayIndex,
                            hour,
                          );
                          const endsSelection = isSelectionEnd(
                            selection,
                            dayIndex,
                            hour,
                          );
                          const slotLabel = buildSlotAriaLabel(day, hour, cell);

                          return (
                            <SlotDetailsPopover
                              cell={cell}
                              className={cn(
                                "border-b border-r border-slate-100 bg-background",
                                day.closedReason && "bg-slate-50/80",
                                dayIndex === currentWeekDays.length - 1 &&
                                  "border-r-0",
                              )}
                              isDragging={isDragging}
                              key={`${day.dateParam}-${hour}`}
                              style={{
                                gridColumn: dayIndex + 2,
                                gridRow: hourIndex + 1,
                              }}
                            >
                              <div
                                aria-disabled={!cell.isRequestable}
                                aria-label={slotLabel}
                                aria-pressed={isSelected}
                                className={cn(
                                  "relative h-full w-full bg-background p-0 text-left transition-colors focus-visible:z-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  !cell.isRequestable && "cursor-not-allowed",
                                  cell.isRequestable && "cursor-pointer",
                                  day.closedReason &&
                                    "cursor-not-allowed bg-slate-50/80 text-slate-400",
                                  !cell.isWorkingHour &&
                                    "cursor-not-allowed bg-slate-50 text-slate-400",
                                  cell.isWorkingHour &&
                                    cell.availableCount <= 0 &&
                                    cell.unavailableReason !== "past" &&
                                    "cursor-not-allowed bg-slate-50 text-slate-500",
                                  cell.isWorkingHour &&
                                    cell.unavailableReason === "past" &&
                                    "cursor-not-allowed bg-slate-100/70 text-slate-400",
                                  cell.isWorkingHour &&
                                    cell.myReservationStatus === "PENDING" &&
                                    "bg-amber-50/70 text-amber-900 ring-1 ring-inset ring-amber-200",
                                  cell.isWorkingHour &&
                                    cell.myReservationStatus === "APPROVED" &&
                                    "bg-sky-50/70 text-sky-900 ring-1 ring-inset ring-sky-200",
                                  cell.isRequestable && "hover:bg-sky-50/50",
                                )}
                                data-calendar-cell="true"
                                data-day-index={dayIndex}
                                data-hour={hour}
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter" && event.key !== " ") {
                                    return;
                                  }

                                  event.preventDefault();

                                  if (!cell.isRequestable) {
                                    return;
                                  }

                                  const nextSelection = buildSelection(
                                    currentWeekDays,
                                    dayIndex,
                                    hour,
                                    hour,
                                  );
                                  selectionRef.current = nextSelection;
                                  setSelection(nextSelection);
                                  setSelectionSource("desktop");
                                  setIsDialogOpen(true);
                                }}
                                onPointerDown={(event) =>
                                  startSelection(
                                    dayIndex,
                                    hour,
                                    event.pointerId,
                                    event.currentTarget,
                                  )
                                }
                                onPointerEnter={() => {
                                  if (isDragging) {
                                    updateSelection(dayIndex, hour);
                                  }
                                }}
                                onPointerMove={(event) => {
                                  if (isDragging) {
                                    updateSelectionFromPoint(
                                      event.clientX,
                                      event.clientY,
                                    );
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                              >
                                {isSelected ? (
                                  <span
                                    className={cn(
                                      "absolute inset-x-1 -top-px bottom-0 z-20 bg-sky-600/85 shadow-sm",
                                      startsSelection && "rounded-t-md",
                                      endsSelection && "rounded-b-md",
                                    )}
                                  >
                                    {startsSelection && selection ? (
                                      <span className="block px-2 py-1 text-xs font-medium text-white">
                                        {formatHour(selection.startHour)} -{" "}
                                        {formatHour(selection.endHour)}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : null}

                                {cell.isWorkingHour &&
                                !day.closedReason &&
                                cell.unavailableReason !== "past" ? (
                                  <>
                                    <CapacityDots cell={cell} />
                                    <PendingRequestsBadge
                                      className="absolute right-2 top-1.5 z-10"
                                      count={cell.pendingCount}
                                    />
                                  </>
                                ) : null}

                                {!cell.isWorkingHour ? (
                                  <span className="sr-only">روز غیرکاری</span>
                                ) : null}
                              </div>
                            </SlotDetailsPopover>
                          );
                        }),
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {selection ? (
          <p className="text-sm text-muted-foreground" dir="rtl">
            بازه انتخاب‌شده: {formatPersianHour(selection.startHour)} تا{" "}
            {formatPersianHour(selection.endHour)}، مدت{" "}
            {formatPersianNumber(selectedHours)} ساعت
          </p>
        ) : null}

        <MeetingRoomRequestDialog
          clearSelection={clearSelection}
          isOpen={isDialogOpen}
          selection={selection}
          setIsDialogOpen={setIsDialogOpen}
          weekDays={currentWeekDays}
        />
      </form>
    </>
  );
}
