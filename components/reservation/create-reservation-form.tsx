"use client";

import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { SubmitButton } from "@/components/ui/submit-button";
import { JALALI_DATE_INPUT_PLACEHOLDER } from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

type ResourcePoolOption = {
  id: string;
  name: string;
};

export type RequestableSlot = {
  slotStartHour: number;
  slotEndHour: number;
  approvedCount: number;
  approvedReservations: SlotReservationDetail[];
  pendingCount: number;
  pendingReservations: SlotReservationDetail[];
  capacity: number;
  isRequestable: boolean;
  myReservationId: string | null;
  myReservationStatus: "ALTERNATIVE_PROPOSED" | "APPROVED" | "PENDING" | null;
  unavailableReason: "full" | "past" | null;
};

export type WeekDay = {
  closedReason: string | null;
  dateLabel: string;
  modalDateLabel: string;
  dateParam: string;
  shortLabel: string;
  slots: RequestableSlot[];
};

export type CreateReservationFormProps = {
  action: (formData: FormData) => Promise<void>;
  currentDateParam: string;
  dailyActiveReservationCountByDate: Record<string, number>;
  dailyReservedHoursByDate: Record<string, number>;
  dailyUserHourLimit: number;
  emptyMessage: string;
  nextWeekDateParam: string;
  oneReservationPerDayEnabled: boolean;
  previousWeekDateParam: string;
  resourcePools: ResourcePoolOption[];
  todayDateParam: string;
  weekDays: WeekDay[];
  weekLabel: string;
};

type Selection = {
  anchorHour: number;
  dateParam: string;
  dayIndex: number;
  endHour: number;
  startHour: number;
};

type CellState = {
  approvedCount: number;
  approvedReservations: SlotReservationDetail[];
  availableCount: number;
  capacity: number;
  isRequestable: boolean;
  isWorkingHour: boolean;
  myReservationId: string | null;
  myReservationStatus: "ALTERNATIVE_PROPOSED" | "APPROVED" | "PENDING" | null;
  pendingCount: number;
  pendingReservations: SlotReservationDetail[];
  unavailableReason: "full" | "past" | null;
};

type CapacityDotTone = "approved" | "free" | "mine";

export type SlotReservationDetail = {
  email: string | null;
  id: string;
  partySize: number;
  userId: string;
  userName: string | null;
};

type PopoverPosition = {
  left: number;
  top: number;
};

function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

const PERSIAN_HOUR_FORMATTER = new Intl.NumberFormat("fa-IR", {
  minimumIntegerDigits: 2,
  useGrouping: false,
});

const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR", {
  useGrouping: false,
});

function formatPersianHour(hour: number): string {
  return `${PERSIAN_HOUR_FORMATTER.format(hour)}:۰۰`;
}

function formatPersianNumber(value: number): string {
  return PERSIAN_NUMBER_FORMATTER.format(value);
}

function buildDateHref(dateParam: string): string {
  return `?date=${dateParam}`;
}

function getHourRange(weekDays: WeekDay[]): number[] {
  const slotHours = weekDays.flatMap((day) =>
    day.slots.flatMap((slot) => [slot.slotStartHour, slot.slotEndHour]),
  );

  if (slotHours.length === 0) {
    return [];
  }

  const minHour = Math.min(...slotHours);
  const maxHour = Math.max(...slotHours);

  return Array.from({ length: maxHour - minHour }, (_, index) => minHour + index);
}

function getCellState(day: WeekDay, hour: number): CellState {
  const slot = day.slots.find((item) => item.slotStartHour === hour);

  if (!slot) {
    return {
      approvedCount: 0,
      approvedReservations: [],
      availableCount: 0,
      capacity: 0,
      isRequestable: false,
      isWorkingHour: false,
      myReservationId: null,
      myReservationStatus: null,
      pendingCount: 0,
      pendingReservations: [],
      unavailableReason: null,
    };
  }

  return {
    approvedCount: slot.approvedCount,
    approvedReservations: slot.approvedReservations,
    availableCount: Math.max(slot.capacity - slot.approvedCount, 0),
    capacity: slot.capacity,
    isRequestable: slot.isRequestable,
    isWorkingHour: true,
    myReservationId: slot.myReservationId,
    myReservationStatus: slot.myReservationStatus,
    pendingCount: slot.pendingCount,
    pendingReservations: slot.pendingReservations,
    unavailableReason: slot.unavailableReason,
  };
}

function buildCapacityDots(cell: CellState): CapacityDotTone[] {
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

function CapacityDot({ tone }: { tone: CapacityDotTone }) {
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

function CapacityDots({ cell }: { cell: CellState }) {
  const dots = buildCapacityDots(cell);

  return (
    <span className="absolute inset-x-2 top-1/2 z-10 flex -translate-y-1/2 flex-wrap items-center justify-center gap-1.5">
      {dots.map((tone, index) => (
        <CapacityDot key={`${tone}-${index}`} tone={tone} />
      ))}
    </span>
  );
}

function PendingRequestsBadge({
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

function getReservationDisplayName(reservation: SlotReservationDetail): string {
  return reservation.userName || reservation.email || "کاربر نامشخص";
}

function formatPartySize(partySize: number): string {
  return `${formatPersianNumber(partySize)} نفر`;
}

function ReservationUserList({
  currentUserReservationId,
  currentUserStatus,
  reservations,
  tone,
}: {
  currentUserReservationId?: string | null;
  currentUserStatus?: CellState["myReservationStatus"];
  reservations: SlotReservationDetail[];
  tone: "approved" | "pending";
}) {
  if (reservations.length === 0) {
    return null;
  }

  return (
    <ul className="grid gap-2">
      {reservations.map((reservation) => {
        const isCurrentUserApproved =
          tone === "approved" &&
          currentUserStatus === "APPROVED" &&
          currentUserReservationId === reservation.id;

        return (
          <li
            className="flex min-w-0 items-center gap-2 text-sm leading-6"
            key={reservation.id}
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full border",
                tone === "pending" && "border-amber-500 bg-amber-400",
                tone === "approved" &&
                  isCurrentUserApproved &&
                  "border-sky-600 bg-sky-500",
                tone === "approved" &&
                  !isCurrentUserApproved &&
                  "border-slate-500 bg-slate-400",
              )}
            />
            <span className="min-w-0 flex-1 truncate">
              {getReservationDisplayName(reservation)}
            </span>
            <span className="shrink-0 rounded-sm bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
              {formatPartySize(reservation.partySize)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function SlotDetailsPopover({
  cell,
  children,
  className,
  isDragging,
  style,
}: {
  cell: CellState;
  children: ReactNode;
  className?: string;
  isDragging: boolean;
  style?: CSSProperties;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentId = useId();
  const peopleCount = cell.approvedReservations.length + cell.pendingReservations.length;

  function updatePosition() {
    const trigger = triggerRef.current;

    if (!trigger || typeof window === "undefined") {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 24);
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, 12),
      window.innerWidth - width - 12,
    );
    const top =
      rect.bottom + 10 + 280 > window.innerHeight
        ? Math.max(rect.top - 10, 12)
        : rect.bottom + 10;

    setPosition({ left, top });
  }

  function openPopover({ pinned = false }: { pinned?: boolean } = {}) {
    if (isDragging || !cell.isWorkingHour || peopleCount === 0) {
      return;
    }

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    updatePosition();
    setIsPinned(pinned);
    setIsOpen(true);
  }

  function closePopover() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setIsOpen(false);
    setIsPinned(false);
  }

  function cancelScheduledClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function scheduleClosePopover() {
    if (isPinned) {
      return;
    }

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = setTimeout(closePopover, 150);
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      <div
        aria-describedby={isOpen ? contentId : undefined}
        className={cn("relative", className)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            closePopover();
          }
        }}
        onFocus={() => openPopover()}
        onMouseEnter={() => openPopover()}
        onMouseLeave={scheduleClosePopover}
        ref={triggerRef}
        style={style}
      >
        {children}
      </div>

      {isOpen && position
        ? createPortal(
            <div
              className="fixed z-[80] max-h-[70vh] w-[min(260px,calc(100vw-24px))] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-slate-950 shadow-xl"
              dir="rtl"
              id={contentId}
              onMouseEnter={cancelScheduledClose}
              onMouseLeave={scheduleClosePopover}
              role="tooltip"
              style={{ left: position.left, top: position.top }}
            >
              <div className="grid gap-2 text-right">
                <ReservationUserList
                  currentUserReservationId={cell.myReservationId}
                  currentUserStatus={cell.myReservationStatus}
                  reservations={cell.approvedReservations}
                  tone="approved"
                />
                <ReservationUserList
                  reservations={cell.pendingReservations}
                  tone="pending"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function CalendarLegend() {
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

function getPersianUserStatusLabel(
  status: CellState["myReservationStatus"],
): string | null {
  if (status === "ALTERNATIVE_PROPOSED") {
    return "وضعیت شما نیازمند بررسی زمان پیشنهادی مدیر";
  }

  if (status === "PENDING") {
    return "وضعیت شما در انتظار تایید مدیر";
  }

  if (status === "APPROVED") {
    return "وضعیت شما رزرو تاییدشده";
  }

  return null;
}

function getPersianUnavailableLabel(
  reason: CellState["unavailableReason"],
): string | null {
  if (reason === "full") {
    return "ظرفیت این ساعت تکمیل است";
  }

  if (reason === "past") {
    return "این زمان گذشته و قابل رزرو نیست";
  }

  return null;
}

function buildSlotAriaLabel(day: WeekDay, hour: number, cell: CellState): string {
  if (day.closedReason || !cell.isWorkingHour) {
    return [
      day.dateLabel,
      day.closedReason ?? "روز غیرکاری",
      "این روز قابل رزرو نیست",
    ].join("، ");
  }

  if (cell.unavailableReason === "past") {
    return [
      day.dateLabel,
      `ساعت ${formatPersianHour(hour)}`,
      "این زمان گذشته و قابل رزرو نیست",
    ].join("، ");
  }

  const parts = [
    day.dateLabel,
    `ساعت ${formatPersianHour(hour)}`,
    `ظرفیت آزاد ${formatPersianNumber(cell.availableCount)} از ${formatPersianNumber(
      cell.capacity,
    )}`,
    `${formatPersianNumber(cell.approvedCount)} رزرو تاییدشده`,
    `${formatPersianNumber(cell.pendingCount)} درخواست در انتظار تایید`,
    getPersianUserStatusLabel(cell.myReservationStatus),
    cell.myReservationStatus
      ? null
      : getPersianUnavailableLabel(cell.unavailableReason),
  ];

  return parts.filter(Boolean).join("، ");
}

function selectionContainsHour(
  selection: Selection | null,
  dayIndex: number,
  hour: number,
) {
  if (!selection || selection.dayIndex !== dayIndex) {
    return false;
  }

  return hour >= selection.startHour && hour < selection.endHour;
}

function isSelectionStart(
  selection: Selection | null,
  dayIndex: number,
  hour: number,
) {
  return Boolean(
    selection && selection.dayIndex === dayIndex && selection.startHour === hour,
  );
}

function isSelectionEnd(selection: Selection | null, dayIndex: number, hour: number) {
  return Boolean(
    selection && selection.dayIndex === dayIndex && selection.endHour === hour + 1,
  );
}

function buildSelection(
  weekDays: WeekDay[],
  dayIndex: number,
  anchorHour: number,
  targetHour: number,
): Selection | null {
  const day = weekDays[dayIndex];

  if (!day) {
    return null;
  }

  const step = targetHour >= anchorHour ? 1 : -1;
  let boundedHour = anchorHour;

  for (
    let hour = anchorHour + step;
    step > 0 ? hour <= targetHour : hour >= targetHour;
    hour += step
  ) {
    if (!getCellState(day, hour).isRequestable) {
      break;
    }

    boundedHour = hour;
  }

  const startHour = Math.min(anchorHour, boundedHour);
  const endHour = Math.max(anchorHour, boundedHour) + 1;

  return {
    anchorHour,
    dateParam: day.dateParam,
    dayIndex,
    endHour,
    startHour,
  };
}

export function CreateReservationForm({
  action,
  currentDateParam,
  dailyActiveReservationCountByDate,
  dailyReservedHoursByDate,
  dailyUserHourLimit,
  emptyMessage,
  nextWeekDateParam,
  oneReservationPerDayEnabled,
  previousWeekDateParam,
  resourcePools,
  todayDateParam,
  weekDays,
  weekLabel,
}: CreateReservationFormProps) {
  const defaultPool = resourcePools[0];
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isReasonDialogOpen, setIsReasonDialogOpen] = useState(false);
  const selectionRef = useRef<Selection | null>(null);
  const hours = useMemo(() => getHourRange(weekDays), [weekDays]);
  const weekKey = weekDays.map((day) => day.dateParam).join("|");
  const selectedHours = selection ? selection.endHour - selection.startHour : 0;
  const reservedHoursForSelectedDay = selection
    ? dailyReservedHoursByDate[selection.dateParam] ?? 0
    : 0;
  const selectedDailyTotal = reservedHoursForSelectedDay + selectedHours;
  const isSelectionOverDailyLimit =
    Boolean(selection) && selectedDailyTotal > dailyUserHourLimit;
  const hasActiveReservationForSelectedDay =
    selection
      ? oneReservationPerDayEnabled &&
        (dailyActiveReservationCountByDate[selection.dateParam] ?? 0) > 0
      : false;
  const isSelectionBlocked =
    isSelectionOverDailyLimit || hasActiveReservationForSelectedDay;

  useEffect(() => {
    selectionRef.current = null;
    setSelection(null);
    setIsDragging(false);
    setIsReasonDialogOpen(false);
  }, [weekKey]);

  useEffect(() => {
    if (!isReasonDialogOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsReasonDialogOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isReasonDialogOpen]);

  function startSelection(
    dayIndex: number,
    hour: number,
    pointerId: number,
    target: HTMLElement,
  ) {
    if (!getCellState(weekDays[dayIndex], hour).isRequestable) {
      return;
    }

    target.setPointerCapture(pointerId);
    setIsDragging(true);
    setIsReasonDialogOpen(false);
    const nextSelection = buildSelection(weekDays, dayIndex, hour, hour);
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
  }

  function updateSelection(dayIndex: number, hour: number) {
    setSelection((current) => {
      if (!current || current.dayIndex !== dayIndex) {
        return current;
      }

      const nextSelection = buildSelection(
        weekDays,
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
      setIsReasonDialogOpen(true);
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

  return (
    <>
      <form id="reservation-week-navigation" method="get" />
      <form action={action} className="grid gap-5 rounded-lg border bg-card p-5">
        <div className="grid gap-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="max-w-3xl">
              <h2 className="font-medium">درخواست رزرو جدید</h2>
            </div>

            <div className="hidden w-full flex-col gap-2 sm:flex sm:w-auto sm:flex-row sm:items-center">
              <div className="relative hidden sm:block sm:w-44">
                <CalendarDays
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
                  defaultValue={currentDateParam}
                  dir="ltr"
                  form="reservation-week-navigation"
                  name="date"
                  pattern="\d{4}[-/]\d{1,2}[-/]\d{1,2}"
                  placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
                  title={`Enter a Jalali date like ${JALALI_DATE_INPUT_PLACEHOLDER}`}
                  type="text"
                />
              </div>
              <button
                className="hidden h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:inline-flex"
                form="reservation-week-navigation"
                type="submit"
              >
                نمایش
              </button>
            </div>
          </div>

          <div
            className="grid gap-3 rounded-md border bg-muted/30 p-3"
            dir="rtl"
          >
            <div className="text-center">
              <p className="text-sm font-medium">{weekLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                راهنمای وضعیت ظرفیت هر ساعت پایین تقویم آمده است.
              </p>
            </div>
            <div className="flex items-center gap-2" dir="ltr">
              <Link
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-2 text-sm font-medium hover:bg-accent sm:flex-none sm:px-4"
                href={buildDateHref(previousWeekDateParam)}
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span dir="rtl">هفته قبل</span>
              </Link>
              <Link
                className="inline-flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-md border bg-muted/60 px-2 text-sm font-medium hover:bg-accent sm:flex-none sm:px-4"
                href={buildDateHref(todayDateParam)}
              >
                امروز
              </Link>
              <Link
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-2 text-sm font-medium hover:bg-accent sm:flex-none sm:px-4"
                href={buildDateHref(nextWeekDateParam)}
              >
                <span dir="rtl">هفته بعد</span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
              </Link>
            </div>
          </div>

          <CalendarLegend />
        </div>

        <input name="resourcePoolId" type="hidden" value={defaultPool?.id ?? ""} />
        <input name="date" type="hidden" value={selection?.dateParam ?? ""} />
        <input name="startHour" type="hidden" value={selection?.startHour ?? ""} />
        <input name="endHour" type="hidden" value={selection?.endHour ?? ""} />

        <div className="grid gap-3">
          {hours.length === 0 || !defaultPool ? (
            <p className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
              {defaultPool ? emptyMessage : "No active resource pool is configured."}
            </p>
          ) : (
            <div
              className="overflow-hidden rounded-lg border border-slate-200 bg-background shadow-sm"
              dir="ltr"
              onPointerLeave={() => setIsDragging(false)}
              onPointerUp={finishSelection}
            >
              <div className="overflow-x-auto">
                <div className="min-w-[920px]">
                  <div className="grid grid-cols-[72px_repeat(7,minmax(116px,1fr))] border-b border-slate-100 bg-slate-50/70">
                    <div className="border-r border-slate-100 px-3 py-3 text-xs font-medium text-muted-foreground" />
                    {weekDays.map((day) => (
                      <div
                        className={cn(
                          "border-r border-slate-100 px-3 py-3 text-center text-sm font-semibold last:border-r-0",
                          day.closedReason && "bg-slate-100/80 text-slate-500",
                        )}
                        key={day.dateParam}
                        title={
                          day.closedReason
                            ? `${day.dateLabel}، ${day.closedReason}، این روز قابل رزرو نیست`
                            : day.dateLabel
                        }
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

                  <div className="max-h-[460px] overflow-y-auto">
                    <div
                      className="grid touch-none select-none grid-cols-[72px_repeat(7,minmax(116px,1fr))]"
                      style={{
                        gridTemplateRows: `repeat(${hours.length}, 3.25rem)`,
                      }}
                    >
                      {hours.map((hour, hourIndex) => (
                        <div
                          className="relative border-b border-r border-slate-100 bg-slate-50/40"
                          key={`time-${hour}`}
                          style={{ gridColumn: 1, gridRow: hourIndex + 1 }}
                        >
                          <span className="absolute right-3 top-1 text-xs font-medium text-muted-foreground">
                            {formatHour(hour)}
                          </span>
                        </div>
                      ))}

                      {hours.map((hour, hourIndex) =>
                        weekDays.map((day, dayIndex) => {
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
                                dayIndex === weekDays.length - 1 && "border-r-0",
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
                                    (cell.myReservationStatus === "PENDING" ||
                                      cell.myReservationStatus ===
                                        "ALTERNATIVE_PROPOSED") &&
                                    "bg-amber-50/70 text-amber-900 ring-1 ring-inset ring-amber-200",
                                  cell.isWorkingHour &&
                                    cell.myReservationStatus === "APPROVED" &&
                                    "bg-sky-50/70 text-sky-900 ring-1 ring-inset ring-sky-200",
                                  cell.isRequestable && "hover:bg-sky-50/50",
                                )}
                                data-calendar-cell="true"
                                data-day-index={dayIndex}
                                data-hour={hour}
                                title={slotLabel}
                                onKeyDown={(event) => {
                                  if (
                                    event.key !== "Enter" &&
                                    event.key !== " "
                                  ) {
                                    return;
                                  }

                                  event.preventDefault();

                                  if (!cell.isRequestable) {
                                    return;
                                  }

                                  const nextSelection = buildSelection(
                                    weekDays,
                                    dayIndex,
                                    hour,
                                    hour,
                                  );
                                  selectionRef.current = nextSelection;
                                  setSelection(nextSelection);
                                  setIsReasonDialogOpen(true);
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
          )}
        </div>

        {isReasonDialogOpen ? (
          <div
            aria-labelledby="reservation-reason-dialog-title"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
            role="dialog"
          >
            <button
              aria-label="بستن فرم درخواست"
              className="absolute inset-0 cursor-default"
              onClick={() => setIsReasonDialogOpen(false)}
              type="button"
            />
            <div className="relative z-10 grid w-full max-w-lg gap-5 rounded-lg border bg-background p-5 shadow-lg">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3
                    className="font-medium"
                    id="reservation-reason-dialog-title"
                  >
                    تکمیل درخواست رزرو
                  </h3>
                  {selection ? (
                    <div className="mt-1 grid gap-1 text-sm text-muted-foreground">
                      <p dir="rtl">
                        {weekDays[selection.dayIndex]?.modalDateLabel ??
                          selection.dateParam}
                        ، {formatPersianHour(selection.startHour)} تا{" "}
                        {formatPersianHour(selection.endHour)}
                      </p>
                      <p>
                        مجموع امروز: {formatPersianNumber(selectedDailyTotal)} از{" "}
                        {formatPersianNumber(dailyUserHourLimit)} ساعت
                      </p>
                    </div>
                  ) : null}
                </div>
                <button
                  aria-label="بستن فرم درخواست"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => setIsReasonDialogOpen(false)}
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>

              {isSelectionOverDailyLimit ? (
                <p
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  role="alert"
                >
                  شما نمی‌توانید بیش از{" "}
                  {formatPersianNumber(dailyUserHourLimit)} ساعت در یک روز رزرو
                  کنید. در این روز قبلا{" "}
                  {formatPersianNumber(reservedHoursForSelectedDay)} ساعت رزرو
                  فعال دارید.
                </p>
              ) : null}

              {hasActiveReservationForSelectedDay ? (
                <p
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  role="alert"
                >
                  شما در این روز یک درخواست رزرو فعال دارید.
                </p>
              ) : null}

              <label className="grid gap-2 text-sm font-medium">
                <span>تعداد نفرات</span>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  defaultValue={1}
                  inputMode="numeric"
                  max={20}
                  min={1}
                  name="partySize"
                  required
                  type="number"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium">
                <span>
                  دلیل درخواست{" "}
                  <span className="text-muted-foreground">(اختیاری)</span>
                </span>
                <textarea
                  autoFocus
                  className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  maxLength={500}
                  name="reason"
                  placeholder="توضیح کوتاهی درباره درخواست بنویسید"
                />
              </label>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
                  onClick={() => setIsReasonDialogOpen(false)}
                  type="button"
                >
                  انصراف
                </button>
                <SubmitButton
                  disabled={isSelectionBlocked}
                  pendingLabel="در حال ثبت..."
                >
                  ثبت درخواست
                </SubmitButton>
              </div>
            </div>
          </div>
        ) : null}
      </form>
    </>
  );
}
