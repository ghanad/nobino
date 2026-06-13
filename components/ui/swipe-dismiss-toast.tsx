"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent,
} from "react";

import { cn } from "@/lib/utils";

const SWIPE_INTENT_PX = 8;
const SWIPE_DISMISS_PX = 96;
const SWIPE_DISMISS_RATIO = 0.35;

type SwipeDismissToastProps = HTMLAttributes<HTMLDivElement> & {
  onDismiss: () => void;
};

export function SwipeDismissToast({
  className,
  onDismiss,
  style,
  ...props
}: SwipeDismissToastProps) {
  const [offsetX, setOffsetX] = useState(0);
  const activePointerIdRef = useRef<number | null>(null);
  const isSwipingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);

  function resetSwipe() {
    activePointerIdRef.current = null;
    isSwipingRef.current = false;
    startXRef.current = 0;
    startYRef.current = 0;
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.pointerType === "mouse") {
      return;
    }

    activePointerIdRef.current = event.pointerId;
    isSwipingRef.current = false;
    startXRef.current = event.clientX;
    startYRef.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - startXRef.current;
    const deltaY = event.clientY - startYRef.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!isSwipingRef.current) {
      if (absX < SWIPE_INTENT_PX && absY < SWIPE_INTENT_PX) {
        return;
      }

      if (absY > absX) {
        return;
      }

      isSwipingRef.current = true;
    }

    event.preventDefault();
    setOffsetX(deltaX);
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - startXRef.current;
    const dismissDistance = Math.min(
      SWIPE_DISMISS_PX,
      event.currentTarget.offsetWidth * SWIPE_DISMISS_RATIO,
    );

    if (isSwipingRef.current && Math.abs(deltaX) >= dismissDistance) {
      onDismiss();
      resetSwipe();
      return;
    }

    resetSwipe();
    setOffsetX(0);
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    resetSwipe();
    setOffsetX(0);
  }

  const swipeStyle: CSSProperties = {
    ...style,
    opacity: offsetX ? Math.max(0.45, 1 - Math.abs(offsetX) / 360) : undefined,
    transform: offsetX ? `translate3d(${offsetX}px, 0, 0)` : undefined,
    transition: offsetX ? "none" : "transform 150ms ease, opacity 150ms ease",
  };

  return (
    <div
      {...props}
      className={cn("touch-pan-y", className)}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      style={swipeStyle}
    />
  );
}
