"use client";

import { Users } from "lucide-react";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";

import { ReservationUserName } from "@/components/calendar/manager-weekly-calendar/reservation-user-name";
import type {
  PositionedReservationBlock,
  ResizeEdge,
} from "@/components/calendar/manager-weekly-calendar/types";
import { cn } from "@/lib/utils";

import { formatPersianNumber } from "./formatting";
import {
  canUpdateReservationTime,
  getDetailClass,
  getMobileReservationBlockStyle,
} from "./reservation-block-helpers";

export function MobileReservationBlock({
  block,
  isResizing,
  onResizeStart,
}: {
  block: PositionedReservationBlock;
  isResizing: boolean;
  onResizeStart: (
    event: ReactPointerEvent<HTMLElement>,
    block: PositionedReservationBlock,
    edge: ResizeEdge,
  ) => void;
}) {
  const { detail } = block;
  const canResize = canUpdateReservationTime(detail.status);
  const suppressNextClickRef = useRef(false);
  const className = cn(
    "pointer-events-auto relative flex h-full min-w-0 flex-col items-center justify-between gap-2 rounded-md px-2.5 py-3 text-xs font-medium leading-5 shadow-sm ring-1 transition",
    getDetailClass(detail.status),
    canResize ? "touch-none" : null,
    isResizing ? "opacity-45" : null,
  );
  const content = (
    <>
      {canResize ? (
        <span
          aria-label="تغییر زمان شروع"
          className="absolute inset-x-3 top-0 z-20 flex h-6 cursor-ns-resize items-start justify-center rounded-t-md pt-1"
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
        >
          <span className="h-1.5 w-14 rounded-full border border-amber-500/70 bg-white/90 shadow-sm" />
        </span>
      ) : null}
      <ReservationUserName detail={detail} />
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] leading-4 opacity-80">
        <Users aria-hidden="true" className="h-3 w-3" />
        {formatPersianNumber(detail.partySize)} نفر
      </span>
      {canResize ? (
        <span
          aria-label="تغییر زمان پایان"
          className="absolute inset-x-3 bottom-0 z-20 flex h-6 cursor-ns-resize items-end justify-center rounded-b-md pb-1"
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
        >
          <span className="h-1.5 w-14 rounded-full border border-amber-500/70 bg-white/90 shadow-sm" />
        </span>
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
        dir="rtl"
        href={detail.href}
        onClickCapture={(event) => {
          if (!suppressNextClickRef.current) {
            return;
          }

          suppressNextClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        style={getMobileReservationBlockStyle(block)}
        title={
          canResize
            ? "برای بررسی لمس کنید، یا لبه بالا/پایین را برای تغییر زمان بکشید"
            : `${formatPersianNumber(detail.partySize)} نفر${detail.reason ? ` - ${detail.reason}` : ""}`
        }
      >
        {content}
      </a>
    );
  }

  return (
    <span
      className={className}
      dir="rtl"
      style={getMobileReservationBlockStyle(block)}
      title={`${formatPersianNumber(detail.partySize)} نفر${detail.reason ? ` - ${detail.reason}` : ""}`}
    >
      {content}
    </span>
  );
}
