"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { formatPersianNumber } from "@/components/reservation/create-reservation/formatters";
import type {
  CellState,
  SlotReservationDetail,
} from "@/components/reservation/create-reservation/types";
import { cn } from "@/lib/utils";

type PopoverPosition = {
  left: number;
  maxHeight: number;
  placement: "bottom" | "top";
  top: number;
};

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

export function SlotDetailsPopover({
  cell,
  children,
  className,
  disabled = false,
  isDragging,
  style,
}: {
  cell: CellState;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  isDragging: boolean;
  style?: CSSProperties;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentId = useId();
  const peopleCount = cell.approvedReservations.length + cell.pendingReservations.length;
  const isInteractionDisabled = disabled || isDragging;

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
    if (isInteractionDisabled || !cell.isWorkingHour || peopleCount === 0) {
      return;
    }

    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
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
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }

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

  function scheduleHoverOpen() {
    if (isInteractionDisabled || !cell.isWorkingHour || peopleCount === 0) {
      return;
    }

    cancelScheduledClose();

    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
    }

    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null;
      openPopover();
    }, 500);
  }

  function scheduleClosePopover() {
    if (isPinned) {
      return;
    }

    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
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
    if (isInteractionDisabled) {
      closePopover();
    }
  }, [isInteractionDisabled]);

  useEffect(() => {
    return () => {
      if (openTimerRef.current) {
        clearTimeout(openTimerRef.current);
      }

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
        onMouseEnter={scheduleHoverOpen}
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
