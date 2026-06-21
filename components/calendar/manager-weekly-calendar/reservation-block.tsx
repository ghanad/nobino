"use client";

import { Users } from "lucide-react";
import { useRef, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";

import { ReservationUserName } from "@/components/calendar/manager-weekly-calendar/reservation-user-name";
import type {
  DraggedReservation,
  PositionedReservationBlock,
  ResizeEdge,
} from "@/components/calendar/manager-weekly-calendar/types";
import { cn } from "@/lib/utils";

import {
  canUpdateReservationTime,
  getDetailClass,
  getReservationBlockStyle,
} from "./reservation-block-helpers";

export function ReservationBlock({
  block,
  isDragging,
  isResizing,
  onDragEnd,
  onDragStart,
  onResizeStart,
}: {
  block: PositionedReservationBlock;
  isDragging: boolean;
  isResizing: boolean;
  onDragEnd: () => void;
  onDragStart: (block: PositionedReservationBlock) => void;
  onResizeStart: (
    event: ReactPointerEvent<HTMLElement>,
    block: PositionedReservationBlock,
    edge: ResizeEdge,
  ) => void;
}) {
  const { detail } = block;
  const canDrag = canUpdateReservationTime(detail.status);
  const suppressNextClickRef = useRef(false);
  const className = cn(
    "group pointer-events-auto relative flex h-full min-w-0 flex-col items-center justify-between gap-2 rounded-md px-1.5 py-2 text-xs font-medium leading-5 shadow-sm ring-1 transition sm:hover:z-40",
    getDetailClass(detail.status),
    canDrag ? "cursor-grab active:cursor-grabbing" : null,
    isDragging || isResizing ? "opacity-45" : null,
  );
  const dragProps = canDrag
    ? {
        draggable: true,
        onDragEnd,
        onDragStart: (event: DragEvent<HTMLElement>) => {
          const payload: DraggedReservation = {
            durationHours: block.endHour - block.startHour,
            reservationId: detail.id,
            status: detail.status,
          };

          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(
            "application/x-nobino-reservation",
            JSON.stringify(payload),
          );
          onDragStart(block);
        },
      }
    : {};
  const content = (
    <>
      {canDrag ? (
        <span
          aria-label="Change reservation start time"
          className="absolute inset-x-1 top-0 h-3 cursor-ns-resize rounded-t-md border-t-2 border-amber-700/70 bg-amber-200/80 opacity-0 transition-opacity hover:opacity-100"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            suppressNextClickRef.current = true;
            onResizeStart(event, block, "start");
          }}
          role="button"
          tabIndex={-1}
          title="برای تغییر زمان شروع بکشید"
        />
      ) : null}
      <ReservationUserName detail={detail} />
      <span
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-1/2 top-1/2 z-30 max-w-56 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2.5 py-1.5 text-center text-xs font-medium leading-5 text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100"
        dir="rtl"
        role="tooltip"
      >
        {detail.userName}
      </span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-[9px] leading-3 opacity-80">
        <Users aria-hidden="true" className="h-2.5 w-2.5" />
        {detail.partySize}
      </span>
      {canDrag ? (
        <span
          aria-label="Change reservation end time"
          className="absolute inset-x-1 bottom-0 h-3 cursor-ns-resize rounded-b-md border-b-2 border-amber-700/70 bg-amber-200/80 opacity-0 transition-opacity hover:opacity-100"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            suppressNextClickRef.current = true;
            onResizeStart(event, block, "end");
          }}
          role="button"
          tabIndex={-1}
          title="برای تغییر زمان پایان بکشید"
        />
      ) : null}
    </>
  );

  if (detail.href) {
    const hoverClass =
      detail.status === "APPROVED" ? "hover:bg-emerald-200" : "hover:bg-amber-200";

    return (
      <a
        className={cn(
          className,
          hoverClass,
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        href={detail.href}
        onClickCapture={(event) => {
          if (!suppressNextClickRef.current) {
            return;
          }

          suppressNextClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        {...dragProps}
        style={getReservationBlockStyle(block)}
      >
        {content}
      </a>
  );
  }

  return (
    <span
      className={className}
      {...dragProps}
      style={getReservationBlockStyle(block)}
    >
      {content}
    </span>
  );
}
