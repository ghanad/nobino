"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  XCircle,
  X,
} from "lucide-react";
import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { LunchActionState } from "@/app/lunch/actions";
import type { CreateReservationActionState } from "@/app/reservations/actions";
import { SwipeDismissToast } from "@/components/ui/swipe-dismiss-toast";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatJalaliDateParam } from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

type ResourcePoolOption = {
  id: string;
  name: string;
};

type LunchLocationOption = {
  id: string;
  name: string;
};

type LunchAvailability = {
  cutoffLabel: string;
  existingReservation: boolean;
  isOpen: boolean;
  unavailableReason: string | null;
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
  action: (
    previousState: CreateReservationActionState,
    formData: FormData,
  ) => Promise<CreateReservationActionState>;
  currentDateParam: string;
  dailyActiveReservationCountByDate: Record<string, number>;
  dailyReservedHoursByDate: Record<string, number>;
  dailyUserHourLimit: number;
  emptyMessage: string;
  lunchAvailabilityByDate: Record<string, LunchAvailability>;
  lunchLocations: LunchLocationOption[];
  lunchReservationAction: (
    previousState: LunchActionState,
    formData: FormData,
  ) => Promise<LunchActionState>;
  nextWeekDateParam: string;
  oneReservationPerDayEnabled: boolean;
  previousWeekDateParam: string;
  resourcePools: ResourcePoolOption[];
  todayDateParam: string;
  onReservationCreated?: (
    mutation: NonNullable<CreateReservationActionState["mutation"]>,
  ) => void;
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
  maxHeight: number;
  placement: "bottom" | "top";
  top: number;
};

type MobileSelectionHandle = "end" | "start";
type SelectionSource = "desktop" | "mobile";

type ActionToast = {
  id: number;
  message: string;
  variant: "error" | "success";
};

type ActionStateBase = {
  status: "error" | "idle" | "success";
};

type LunchPrompt = {
  dateLabel: string;
  dateParam: string;
  partySize: number;
};

const initialCreateReservationState: CreateReservationActionState = {
  message: "",
  status: "idle",
};

const initialLunchActionState: LunchActionState = {
  message: "",
  status: "idle",
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

function formatPersianShortHour(hour: number): string {
  return PERSIAN_HOUR_FORMATTER.format(hour);
}

function formatPersianShortHourRange(startHour: number, endHour: number): string {
  return `${formatPersianShortHour(startHour)}–${formatPersianShortHour(endHour)}`;
}

function formatPersianHourRangeTooltip(startHour: number, endHour: number): string {
  return `از ${formatPersianHour(startHour)} تا ${formatPersianHour(endHour)}`;
}

function formatPersianHourRangeAriaLabel(
  startHour: number,
  endHour: number,
): string {
  return `از ساعت ${formatPersianHour(startHour)} تا ${formatPersianHour(endHour)}`;
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
    const width = Math.min(260, window.innerWidth - 24);
    const availableAbove = Math.max(rect.top - 12, 0);
    const availableBelow = Math.max(window.innerHeight - rect.bottom - 12, 0);
    const placement =
      availableAbove > availableBelow && availableBelow < 280 ? "top" : "bottom";
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, 12),
      window.innerWidth - width - 12,
    );
    const top = placement === "top" ? rect.top - 10 : rect.bottom + 10;
    const maxHeight =
      placement === "top"
        ? Math.max(availableAbove - 10, 80)
        : Math.max(availableBelow - 10, 80);

    setPosition({ left, maxHeight, placement, top });
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
              className="pointer-events-none fixed z-[80] w-[min(260px,calc(100vw-24px))] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-slate-950 shadow-xl"
              dir="rtl"
              id={contentId}
              onMouseEnter={cancelScheduledClose}
              onMouseLeave={scheduleClosePopover}
              role="tooltip"
              style={{
                left: position.left,
                maxHeight: position.maxHeight,
                top: position.top,
                transform:
                  position.placement === "top" ? "translateY(-100%)" : undefined,
              }}
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

function getDefaultSelectedDayIndex(
  weekDays: WeekDay[],
  todayDateParam: string,
): number {
  const todayIndex = weekDays.findIndex(
    (day) => day.dateParam === todayDateParam,
  );

  if (todayIndex >= 0) {
    return todayIndex;
  }

  const firstWorkingDayIndex = weekDays.findIndex(
    (day) => !day.closedReason && day.slots.length > 0,
  );

  return firstWorkingDayIndex >= 0 ? firstWorkingDayIndex : 0;
}

function getMobileSlotStatusLabel(cell: CellState): string | null {
  if (cell.myReservationStatus === "ALTERNATIVE_PROPOSED") {
    return "زمان پیشنهادی مدیر نیازمند بررسی شماست";
  }

  if (cell.myReservationStatus === "PENDING") {
    return "درخواست شما در انتظار تایید است";
  }

  if (cell.myReservationStatus === "APPROVED") {
    return "رزرو تاییدشده شما";
  }

  if (cell.unavailableReason === "past") {
    return "این زمان گذشته و قابل رزرو نیست";
  }

  if (cell.unavailableReason === "full") {
    return "ظرفیت تکمیل است";
  }

  return null;
}

function getMobileSlotStatusBadgeLabel(cell: CellState): string | null {
  if (cell.myReservationStatus === "ALTERNATIVE_PROPOSED") {
    return "جایگزین";
  }

  if (cell.myReservationStatus === "PENDING") {
    return "در انتظار";
  }

  if (cell.myReservationStatus === "APPROVED") {
    return "تایید شده";
  }

  return null;
}

function getMobileSlotToneClass(cell: CellState): string {
  if (cell.myReservationStatus === "APPROVED") {
    return "border-sky-200 bg-sky-50/70";
  }

  if (
    cell.myReservationStatus === "PENDING" ||
    cell.myReservationStatus === "ALTERNATIVE_PROPOSED"
  ) {
    return "border-amber-200 bg-amber-50/70";
  }

  if (cell.unavailableReason || !cell.isRequestable) {
    return "border-slate-200 bg-slate-50/80";
  }

  return "border-emerald-200 bg-white";
}

function isMobileSlotSelectable(cell: CellState): boolean {
  return cell.isRequestable && !cell.myReservationStatus;
}

function getMobileSlotUnavailableLabel(cell: CellState): string {
  if (cell.myReservationStatus === "ALTERNATIVE_PROPOSED") {
    return "زمان پیشنهادی مدیر برای شما ثبت شده است";
  }

  if (cell.myReservationStatus === "PENDING") {
    return "درخواست شما در انتظار تایید است";
  }

  if (cell.myReservationStatus === "APPROVED") {
    return "رزرو تاییدشده شما";
  }

  return getPersianUnavailableLabel(cell.unavailableReason) ?? "قابل رزرو نیست";
}

function ReservationsActionToast({
  onDismiss,
  toast,
}: {
  onDismiss: () => void;
  toast: ActionToast | null;
}) {
  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(onDismiss, 4_500);

    return () => window.clearTimeout(timeout);
  }, [onDismiss, toast]);

  if (!toast) {
    return null;
  }

  const Icon = toast.variant === "error" ? XCircle : CheckCircle2;

  return (
    <SwipeDismissToast
      className={cn(
        "fixed right-6 top-6 z-50 flex w-[min(420px,calc(100vw-3rem))] items-start gap-3 rounded-lg border bg-background p-4 text-sm shadow-lg",
        toast.variant === "error"
          ? "border-destructive/30 text-destructive"
          : "border-emerald-200 text-emerald-900",
      )}
      onDismiss={onDismiss}
      role="status"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 pl-8 leading-6">{toast.message}</p>
      <button
        aria-label="بستن پیام"
        className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onDismiss}
        type="button"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </SwipeDismissToast>
  );
}

function ActionResultBridge<TState extends ActionStateBase>({
  onComplete,
  state,
}: {
  onComplete: (state: TState) => void;
  state: TState;
}) {
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (state.status === "idle") {
      return;
    }

    onCompleteRef.current(state);
  }, [state]);

  return null;
}

function getSelectionRangeError(
  weekDays: WeekDay[],
  selection: Selection | null,
): string | null {
  if (!selection) {
    return null;
  }

  const day = weekDays[selection.dayIndex];

  if (!day) {
    return "روز انتخاب‌شده معتبر نیست.";
  }

  for (let hour = selection.startHour; hour < selection.endHour; hour += 1) {
    const cell = getCellState(day, hour);

    if (!cell.isWorkingHour) {
      return `امکان رزرو این بازه وجود ندارد، چون ساعت ${formatPersianHour(
        hour,
      )} در برنامه کاری این روز نیست.`;
    }

    if (!isMobileSlotSelectable(cell)) {
      return `امکان رزرو این بازه وجود ندارد، چون ساعت ${formatPersianHour(
        hour,
      )} ${getMobileSlotUnavailableLabel(cell)}.`;
    }
  }

  return null;
}

function getSelectionLimitError({
  dailyUserHourLimit,
  hasActiveReservationForSelectedDay,
  isSelectionOverDailyLimit,
  reservedHoursForSelectedDay,
}: {
  dailyUserHourLimit: number;
  hasActiveReservationForSelectedDay: boolean;
  isSelectionOverDailyLimit: boolean;
  reservedHoursForSelectedDay: number;
}): string | null {
  if (isSelectionOverDailyLimit) {
    return `شما نمی‌توانید بیش از ${formatPersianNumber(
      dailyUserHourLimit,
    )} ساعت در یک روز رزرو کنید. در این روز قبلا ${formatPersianNumber(
      reservedHoursForSelectedDay,
    )} ساعت رزرو فعال دارید.`;
  }

  if (hasActiveReservationForSelectedDay) {
    return "شما در این روز یک درخواست رزرو فعال دارید.";
  }

  return null;
}

export function CreateReservationForm({
  action,
  dailyActiveReservationCountByDate,
  dailyReservedHoursByDate,
  dailyUserHourLimit,
  emptyMessage,
  lunchAvailabilityByDate,
  lunchLocations,
  lunchReservationAction,
  nextWeekDateParam,
  oneReservationPerDayEnabled,
  onReservationCreated,
  previousWeekDateParam,
  resourcePools,
  todayDateParam,
  weekDays,
  weekLabel,
}: CreateReservationFormProps) {
  const defaultPool = resourcePools[0];
  const [state, formAction] = useActionState(
    action,
    initialCreateReservationState,
  );
  const [lunchState, lunchFormAction] = useActionState(
    lunchReservationAction,
    initialLunchActionState,
  );
  const [toast, setToast] = useState<ActionToast | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectionSource, setSelectionSource] = useState<SelectionSource | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);
  const [mobileDraggingHandle, setMobileDraggingHandle] =
    useState<MobileSelectionHandle | null>(null);
  const [isReasonDialogOpen, setIsReasonDialogOpen] = useState(false);
  const [partySize, setPartySize] = useState(1);
  const [lunchPrompt, setLunchPrompt] = useState<LunchPrompt | null>(null);
  const [selectedMobileDayIndex, setSelectedMobileDayIndex] = useState(() =>
    getDefaultSelectedDayIndex(weekDays, todayDateParam),
  );
  const selectionRef = useRef<Selection | null>(null);
  const hours = useMemo(() => getHourRange(weekDays), [weekDays]);
  const weekKey = weekDays.map((day) => day.dateParam).join("|");
  const defaultMobileDayIndex = useMemo(
    () => getDefaultSelectedDayIndex(weekDays, todayDateParam),
    [todayDateParam, weekDays],
  );
  const isCurrentWeek = useMemo(
    () => weekDays.some((day) => day.dateParam === todayDateParam),
    [todayDateParam, weekDays],
  );
  const selectedMobileDay =
    weekDays[selectedMobileDayIndex] ?? weekDays[0] ?? null;
  const selectedHours = selection ? selection.endHour - selection.startHour : 0;
  const reservedHoursForSelectedDay = selection
    ? dailyReservedHoursByDate[selection.dateParam] ?? 0
    : 0;
  const selectedDailyTotal = reservedHoursForSelectedDay + selectedHours;
  const selectionRangeError =
    selectionSource === "mobile"
      ? getSelectionRangeError(weekDays, selection)
      : null;
  const isSelectionOverDailyLimit =
    Boolean(selection) && selectedDailyTotal > dailyUserHourLimit;
  const hasActiveReservationForSelectedDay =
    selection
      ? oneReservationPerDayEnabled &&
        (dailyActiveReservationCountByDate[selection.dateParam] ?? 0) > 0
      : false;
  const isSelectionBlocked =
    Boolean(selectionRangeError) ||
    isSelectionOverDailyLimit ||
    hasActiveReservationForSelectedDay;
  const selectionLimitError = getSelectionLimitError({
    dailyUserHourLimit,
    hasActiveReservationForSelectedDay,
    isSelectionOverDailyLimit,
    reservedHoursForSelectedDay,
  });
  const selectionError = selectionRangeError ?? selectionLimitError;
  const selectedLunchDateParam = lunchPrompt?.dateParam ?? selection?.dateParam;
  const lunchAvailability = selectedLunchDateParam
    ? lunchAvailabilityByDate[selectedLunchDateParam] ?? null
    : null;
  const canSubmitLunchReservation = Boolean(
    lunchAvailability?.isOpen && lunchLocations.length > 0,
  );
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    selectionRef.current = null;
    setSelection(null);
    setSelectionSource(null);
    setIsDragging(false);
    setMobileDraggingHandle(null);
    setIsReasonDialogOpen(false);
    setPartySize(1);
    setLunchPrompt(null);
    setSelectedMobileDayIndex(defaultMobileDayIndex);
  }, [defaultMobileDayIndex, weekKey]);

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
    setSelectionSource("desktop");
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

  function clearSelection() {
    selectionRef.current = null;
    setSelection(null);
    setSelectionSource(null);
    setMobileDraggingHandle(null);
    setIsReasonDialogOpen(false);
    setPartySize(1);
    setLunchPrompt(null);
  }

  const handleActionComplete = useCallback(
    (nextState: CreateReservationActionState) => {
      if (nextState.status === "error") {
        setToast({
          id: Date.now(),
          message: nextState.message,
          variant: "error",
        });
        return;
      }

      if (nextState.status === "success" && nextState.mutation) {
        onReservationCreated?.(nextState.mutation);

        const reservationStartAt = new Date(nextState.mutation.startAt);
        const reservationDateParam = formatJalaliDateParam(reservationStartAt);
        const promptAvailability =
          lunchAvailabilityByDate[reservationDateParam] ?? null;
        const reservationDay = weekDays.find(
          (day) => day.dateParam === reservationDateParam,
        );

        if (promptAvailability?.isOpen) {
          setToast(null);
          setLunchPrompt({
            dateLabel: reservationDay?.modalDateLabel ?? reservationDateParam,
            dateParam: reservationDateParam,
            partySize: nextState.mutation.partySize,
          });
          setIsReasonDialogOpen(true);
          return;
        }

        setToast({
          id: Date.now(),
          message: nextState.message,
          variant: "success",
        });
        clearSelection();
      }
    },
    [lunchAvailabilityByDate, onReservationCreated, weekDays],
  );

  const handleLunchActionComplete = useCallback(
    (nextState: LunchActionState) => {
      setToast({
        id: Date.now(),
        message: nextState.message,
        variant: nextState.status === "error" ? "error" : "success",
      });

      if (nextState.status === "success") {
        clearSelection();
      }
    },
    [],
  );

  function selectMobileSingleHour(dayIndex: number, hour: number) {
    const nextSelection = buildSelection(weekDays, dayIndex, hour, hour);

    selectionRef.current = nextSelection;
    setSelection(nextSelection);
    setSelectionSource("mobile");
    setIsReasonDialogOpen(false);
  }

  function openReasonDialogForSelection() {
    if (!selection || isSelectionBlocked) {
      return;
    }

    setIsReasonDialogOpen(true);
  }

  function updateMobileSelectionFromHour(
    handle: MobileSelectionHandle,
    hour: number,
  ) {
    setSelection((current) => {
      if (!current) {
        return current;
      }

      const day = weekDays[current.dayIndex];

      if (!day) {
        return current;
      }

      const slotHours = day.slots.map((slot) => slot.slotStartHour);

      if (!slotHours.includes(hour)) {
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

    if (Number.isNaN(hour)) {
      return;
    }

    updateMobileSelectionFromHour(handle, hour);
  }

  return (
    <>
      <ReservationsActionToast onDismiss={dismissToast} toast={toast} />
      <form action={formAction} className="grid gap-5 rounded-lg border bg-card p-5">
        <ActionResultBridge onComplete={handleActionComplete} state={state} />
        <ActionResultBridge
          onComplete={handleLunchActionComplete}
          state={lunchState}
        />
        <div className="grid gap-4">
          <div
            className="grid gap-3 rounded-md border bg-muted/30 p-3"
            dir="rtl"
          >
            <div
              className="hidden grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:grid"
              dir="ltr"
            >
              <Link
                className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
                href={buildDateHref(previousWeekDateParam)}
                onClick={clearSelection}
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span dir="rtl">هفته قبل</span>
              </Link>
              <div
                className={cn(
                  "h-16 text-center",
                  isCurrentWeek
                    ? "flex items-center justify-center"
                    : "grid content-center justify-items-center gap-2",
                )}
                dir="rtl"
              >
                <p className="text-sm font-medium">{weekLabel}</p>
                {!isCurrentWeek ? (
                  <Link
                    className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md bg-sky-50 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-sky-100 hover:text-slate-800"
                    href={buildDateHref(todayDateParam)}
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
                href={buildDateHref(nextWeekDateParam)}
                onClick={clearSelection}
              >
                <span dir="rtl">هفته بعد</span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
              </Link>
            </div>

            <div className="text-center sm:hidden">
              <p className="text-sm font-medium">{weekLabel}</p>
            </div>
            <div className="flex items-center gap-2 sm:hidden" dir="ltr">
              <Link
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-2 text-sm font-medium hover:bg-accent"
                href={buildDateHref(previousWeekDateParam)}
                onClick={clearSelection}
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span dir="rtl">هفته قبل</span>
              </Link>
              <Link
                className="inline-flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-md border bg-muted/60 px-2 text-sm font-medium hover:bg-accent"
                href={buildDateHref(todayDateParam)}
                onClick={() => {
                  setSelectedMobileDayIndex(defaultMobileDayIndex);
                  clearSelection();
                }}
              >
                امروز
              </Link>
              <Link
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-2 text-sm font-medium hover:bg-accent"
                href={buildDateHref(nextWeekDateParam)}
                onClick={clearSelection}
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
                        onClick={() => {
                          setSelectedMobileDayIndex(dayIndex);
                          clearSelection();
                        }}
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
                      <h3 className="text-sm font-semibold">
                        {selectedMobileDay.dateLabel}
                      </h3>
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
                                    openReasonDialogForSelection();
                                    return;
                                  }

                                  if (!isMobileSlotSelectable(cell)) {
                                    return;
                                  }

                                  selectMobileSingleHour(
                                    selectedMobileDayIndex,
                                    hour,
                                  );
                                }}
                                onKeyDown={(event) => {
                                  if (
                                    event.key !== "Enter" &&
                                    event.key !== " "
                                  ) {
                                    return;
                                  }

                                  event.preventDefault();

                                  if (isSelected) {
                                    openReasonDialogForSelection();
                                    return;
                                  }

                                  if (isMobileSlotSelectable(cell)) {
                                    selectMobileSingleHour(
                                      selectedMobileDayIndex,
                                      hour,
                                    );
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                title={slotLabel}
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
                                        {buildCapacityDots(cell).map(
                                          (tone, index) => (
                                            <CapacityDot
                                              key={`${tone}-${index}`}
                                              tone={tone}
                                            />
                                          ),
                                        )}
                                      </span>
                                    ) : null}

                                    {!isSelected && cell.pendingCount > 0 ? (
                                      <PendingRequestsBadge
                                        count={cell.pendingCount}
                                      />
                                    ) : null}

                                    {!isSelected && mobileStatusBadgeLabel ? (
                                      <span
                                        className={cn(
                                          "inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[11px] font-medium leading-none",
                                          cell.myReservationStatus ===
                                            "APPROVED" &&
                                            "border-sky-200 bg-sky-100/70 text-sky-700",
                                          (cell.myReservationStatus ===
                                            "PENDING" ||
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
                                          onClick={(event) =>
                                            event.stopPropagation()
                                          }
                                          onPointerDown={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            event.currentTarget.setPointerCapture(
                                              event.pointerId,
                                            );
                                            setMobileDraggingHandle("start");
                                          }}
                                          onPointerMove={(event) => {
                                            if (
                                              mobileDraggingHandle === "start"
                                            ) {
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
                                          onClick={(event) =>
                                            event.stopPropagation()
                                          }
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
                                  ) : (
                                    mobileStatusLabel ? (
                                      <span className="grid min-w-0 gap-1">
                                        <span
                                          className={cn(
                                            "text-[13px] font-medium leading-5",
                                            cell.myReservationStatus ===
                                              "APPROVED" && "text-sky-700",
                                            (cell.myReservationStatus ===
                                              "PENDING" ||
                                              cell.myReservationStatus ===
                                                "ALTERNATIVE_PROPOSED") &&
                                              "text-amber-700",
                                            !cell.myReservationStatus &&
                                              "text-slate-500",
                                          )}
                                        >
                                          {mobileStatusLabel}
                                        </span>
                                      </span>
                                    ) : null
                                  )}
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
                    onClick={openReasonDialogForSelection}
                    type="button"
                  >
                    تکمیل درخواست رزرو
                  </button>
                </div>
              ) : null}

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
                          <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-4 text-red-600">
                            {day.closedReason}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="max-h-[460px] overflow-y-auto">
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
                                  setSelectionSource("desktop");
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
            </>
          )}
        </div>

        {isReasonDialogOpen ? (
          <div
            aria-labelledby="reservation-reason-dialog-title"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
            role="dialog"
          >
            <button
              aria-label="بستن فرم درخواست"
              className="absolute inset-0 cursor-default"
              onClick={() => {
                if (lunchPrompt) {
                  clearSelection();
                  return;
                }

                setIsReasonDialogOpen(false);
              }}
              type="button"
            />
            <div className="relative z-10 grid max-h-[92vh] w-full max-w-lg gap-5 overflow-y-auto rounded-t-lg border bg-background p-5 shadow-lg sm:rounded-lg">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3
                    className="font-medium"
                    id="reservation-reason-dialog-title"
                  >
                    {lunchPrompt ? "رزرو ناهار" : "تکمیل درخواست رزرو"}
                  </h3>
                  {lunchPrompt ? (
                    <div className="mt-1 grid gap-1 text-sm text-muted-foreground">
                      <p>درخواست رزرو شما ثبت شد.</p>
                      <p>{lunchPrompt.dateLabel}</p>
                    </div>
                  ) : selection ? (
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
                  onClick={() => {
                    if (lunchPrompt) {
                      clearSelection();
                      return;
                    }

                    setIsReasonDialogOpen(false);
                  }}
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>

              {lunchPrompt ? (
                <>
                  <div className="grid gap-3 rounded-md border border-sky-100 bg-sky-50/60 p-3 text-sm">
                    <p className="font-medium">ناهار هم برای این روز رزرو شود؟</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {lunchAvailability?.cutoffLabel ??
                        "وضعیت رزرو ناهار برای این روز مشخص نیست."}
                    </p>

                    <input name="date" type="hidden" value={lunchPrompt.dateParam} />

                    {canSubmitLunchReservation ? (
                      <label className="grid gap-2 font-medium">
                        <span>محل دریافت ناهار</span>
                        <select
                          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                          defaultValue={lunchLocations[0]?.id ?? ""}
                          name="locationId"
                        >
                          {lunchLocations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <p className="rounded-md border border-amber-200 bg-white/80 px-3 py-2 text-xs leading-5 text-amber-900">
                        {lunchAvailability?.unavailableReason ??
                          "در حال حاضر امکان رزرو ناهار برای این تاریخ وجود ندارد."}
                      </p>
                    )}

                    {lunchPrompt.partySize > 1 ? (
                      <p className="rounded-md border border-amber-200 bg-white/80 px-3 py-2 text-xs leading-5 text-amber-900">
                        ناهار فقط برای خود شما رزرو می‌شود. نفرات دیگر باید با
                        حساب کاربری خودشان ناهار رزرو کنند.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      className="inline-flex h-11 w-full items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent sm:h-10 sm:w-auto"
                      onClick={clearSelection}
                      type="button"
                    >
                      فعلاً نه
                    </button>
                    <SubmitButton
                      className="h-11 w-full sm:h-10 sm:w-auto"
                      disabled={!canSubmitLunchReservation}
                      formAction={lunchFormAction}
                      pendingLabel="در حال ثبت ناهار..."
                    >
                      رزرو ناهار
                    </SubmitButton>
                  </div>
                </>
              ) : (
                <>
                  {isSelectionOverDailyLimit ? (
                    <p
                      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                      role="alert"
                    >
                      شما نمی‌توانید بیش از{" "}
                      {formatPersianNumber(dailyUserHourLimit)} ساعت در یک روز
                      رزرو کنید. در این روز قبلا{" "}
                      {formatPersianNumber(reservedHoursForSelectedDay)} ساعت
                      رزرو فعال دارید.
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
                      inputMode="numeric"
                      max={20}
                      min={1}
                      name="partySize"
                      onChange={(event) => {
                        const nextValue = Number(event.currentTarget.value);
                        setPartySize(Number.isFinite(nextValue) ? nextValue : 1);
                      }}
                      required
                      type="number"
                      value={partySize}
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
                      className="inline-flex h-11 w-full items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent sm:h-10 sm:w-auto"
                      onClick={() => setIsReasonDialogOpen(false)}
                      type="button"
                    >
                      انصراف
                    </button>
                    <SubmitButton
                      className="h-11 w-full sm:h-10 sm:w-auto"
                      disabled={isSelectionBlocked}
                      pendingLabel="در حال ثبت..."
                    >
                      ثبت درخواست
                    </SubmitButton>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
      </form>
    </>
  );
}
