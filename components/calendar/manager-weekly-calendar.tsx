"use client";

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type DragEvent,
} from "react";

import { proposeAlternativeDropAction } from "@/app/manager/actions";
import { CalendarLegend } from "@/components/calendar/manager-weekly-calendar/calendar-legend";
import {
  getDefaultSelectedDayIndex,
  getHourRange,
} from "@/components/calendar/manager-weekly-calendar/calendar-helpers";
import { DesktopManagerWeekGrid } from "@/components/calendar/manager-weekly-calendar/desktop-manager-week-grid";
import { MobileManagerWeekView } from "@/components/calendar/manager-weekly-calendar/mobile-manager-week-view";
import { applyReservationTimeUpdate } from "@/components/calendar/manager-weekly-calendar/reservation-time-update";
import { WeekNavigationHeader } from "@/components/calendar/manager-weekly-calendar/week-navigation-header";
import {
  canUpdateReservationTime,
  getPositionedReservationBlocks,
} from "@/components/calendar/manager-weekly-calendar/reservation-block-helpers";
import type {
  DraggedReservation,
  ManagerWeekDay,
  ManagerWeeklyCalendarProps,
  ManagerWeekSlot,
  ResizingReservation,
  SlotPointerTarget,
} from "@/components/calendar/manager-weekly-calendar/types";

export function ManagerWeeklyCalendar({
  currentDateParam,
  emptyMessage,
  nextWeekDateParam,
  previousWeekDateParam,
  todayDateParam,
  weekDays,
  weekLabel,
}: ManagerWeeklyCalendarProps) {
  const [draggedReservation, setDraggedReservation] =
    useState<DraggedReservation | null>(null);
  const [dragOverSlotKey, setDragOverSlotKey] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [localWeekDays, setLocalWeekDays] = useState(weekDays);
  const [resizeOverSlotKey, setResizeOverSlotKey] = useState<string | null>(
    null,
  );
  const [resizingReservation, setResizingReservation] =
    useState<ResizingReservation | null>(null);
  const [isDropPending, startDropTransition] = useTransition();
  const hours = getHourRange(localWeekDays);
  const firstHour = hours[0] ?? 0;
  const isCurrentWeek = weekDays.some((day) => day.dateParam === todayDateParam);
  const defaultMobileDayIndex = getDefaultSelectedDayIndex(
    localWeekDays,
    currentDateParam,
  );
  const [selectedMobileDayIndex, setSelectedMobileDayIndex] = useState(
    defaultMobileDayIndex,
  );
  const reservationBlocksByDate = new Map(
    localWeekDays.map((day) => [
      day.dateParam,
      getPositionedReservationBlocks(day),
    ]),
  );

  useEffect(() => {
    setLocalWeekDays(weekDays);
  }, [weekDays]);

  useEffect(() => {
    setSelectedMobileDayIndex(
      getDefaultSelectedDayIndex(weekDays, currentDateParam),
    );
  }, [currentDateParam, weekDays]);

  function readDraggedReservation(
    event: DragEvent<HTMLElement>,
  ): DraggedReservation | null {
    if (draggedReservation) {
      return draggedReservation;
    }

    const rawPayload = event.dataTransfer.getData(
      "application/x-nobino-reservation",
    );

    if (!rawPayload) {
      return null;
    }

    try {
      return JSON.parse(rawPayload) as DraggedReservation;
    } catch {
      return null;
    }
  }

  const submitTimeUpdate = useCallback(
    (input: {
      dateParam: string;
      proposedEndHour: number;
      proposedStartHour: number;
      reservationId: string;
    }) => {
      const formData = new FormData();

      formData.set("reservationId", input.reservationId);
      formData.set("proposedDate", input.dateParam);
      formData.set("proposedStartHour", input.proposedStartHour.toString());
      formData.set("proposedEndHour", input.proposedEndHour.toString());
      formData.set("date", currentDateParam);

      startDropTransition(async () => {
        const result = await proposeAlternativeDropAction(formData);

        if (!result.ok) {
          setDropError(result.error);
          return;
        }

        setDropError(null);
        setLocalWeekDays((currentWeekDays) =>
          applyReservationTimeUpdate(currentWeekDays, input),
        );
      });
    },
    [currentDateParam, startDropTransition],
  );

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
    day: ManagerWeekDay,
    slot: ManagerWeekSlot | null,
  ) {
    event.preventDefault();
    setDragOverSlotKey(null);

    const dragged = readDraggedReservation(event);

    if (!slot || !dragged || !canUpdateReservationTime(dragged.status)) {
      return;
    }

    const proposedEndHour = slot.slotStartHour + dragged.durationHours;

    submitTimeUpdate({
      dateParam: day.dateParam,
      proposedEndHour,
      proposedStartHour: slot.slotStartHour,
      reservationId: dragged.reservationId,
    });
  }

  function getSlotPointerTarget(
    clientX: number,
    clientY: number,
  ): SlotPointerTarget | null {
    const elements = document.elementsFromPoint(clientX, clientY);
    const cell = elements
      .map((element) =>
        element instanceof HTMLElement
          ? element.closest<HTMLElement>("[data-manager-calendar-cell='true']")
          : null,
      )
      .find((element): element is HTMLElement => Boolean(element));

    if (!cell) {
      return null;
    }

    const dateParam = cell.dataset.dateParam;
    const slotStartHour = Number(cell.dataset.slotStartHour);
    const slotEndHour = Number(cell.dataset.slotEndHour);

    if (
      !dateParam ||
      !Number.isInteger(slotStartHour) ||
      !Number.isInteger(slotEndHour)
    ) {
      return null;
    }

    return { dateParam, slotEndHour, slotStartHour };
  }

  useEffect(() => {
    if (!resizingReservation) {
      return;
    }

    const resizing = resizingReservation;

    function handlePointerMove(event: PointerEvent) {
      const target = getSlotPointerTarget(event.clientX, event.clientY);

      if (!target || target.dateParam !== resizing.dateParam) {
        setResizeOverSlotKey(null);
        return;
      }

      setResizeOverSlotKey(
        `${target.dateParam}-${target.slotStartHour}-${resizing.edge}`,
      );
    }

    function handlePointerUp(event: PointerEvent) {
      const target = getSlotPointerTarget(event.clientX, event.clientY);

      setResizeOverSlotKey(null);
      setResizingReservation(null);

      if (
        !target ||
        target.dateParam !== resizing.dateParam ||
        !canUpdateReservationTime(resizing.status)
      ) {
        return;
      }

      const proposedStartHour =
        resizing.edge === "start" ? target.slotStartHour : resizing.startHour;
      const proposedEndHour =
        resizing.edge === "end" ? target.slotEndHour : resizing.endHour;

      if (
        proposedStartHour === resizing.startHour &&
        proposedEndHour === resizing.endHour
      ) {
        return;
      }

      if (proposedEndHour <= proposedStartHour) {
        setDropError("مدت رزرو باید حداقل ۱ ساعت باشد.");
        return;
      }

      submitTimeUpdate({
        dateParam: resizing.dateParam,
        proposedEndHour,
        proposedStartHour,
        reservationId: resizing.reservationId,
      });
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [resizingReservation, submitTimeUpdate]);

  return (
    <section className="rounded-lg border bg-card p-5 text-card-foreground">
      <div className="grid gap-4">
        <WeekNavigationHeader
          isCurrentWeek={isCurrentWeek}
          nextWeekDateParam={nextWeekDateParam}
          previousWeekDateParam={previousWeekDateParam}
          todayDateParam={todayDateParam}
          weekLabel={weekLabel}
        />

        <CalendarLegend />
      </div>

      {dropError ? (
        <div
          className="mt-4 rounded-md border border-destructive/30 bg-background p-3 text-sm leading-6 text-destructive"
          role="alert"
        >
          {dropError}
        </div>
      ) : null}

      {hours.length === 0 ? (
        <p className="mt-5 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <>
          <MobileManagerWeekView
            localWeekDays={localWeekDays}
            onResizeStart={(
              event,
              resizeBlock,
              edge,
              dateParam,
            ) => {
              event.preventDefault();
              event.stopPropagation();
              setDropError(null);
              setDraggedReservation(null);
              setDragOverSlotKey(null);
              setResizingReservation({
                dateParam,
                edge,
                endHour: resizeBlock.endHour,
                reservationId: resizeBlock.detail.id,
                startHour: resizeBlock.startHour,
                status: resizeBlock.detail.status,
              });
            }}
            resizeOverSlotKey={resizeOverSlotKey}
            resizingReservation={resizingReservation}
            selectedMobileDayIndex={selectedMobileDayIndex}
            setSelectedMobileDayIndex={setSelectedMobileDayIndex}
            todayDateParam={todayDateParam}
          />

          <DesktopManagerWeekGrid
            draggedReservation={draggedReservation}
            dragOverSlotKey={dragOverSlotKey}
            firstHour={firstHour}
            hours={hours}
            isDropPending={isDropPending}
            localWeekDays={localWeekDays}
            onDragEnd={() => {
              setDraggedReservation(null);
              setDragOverSlotKey(null);
            }}
            onDragStart={(dragBlock) => {
              setDropError(null);
              setDraggedReservation({
                durationHours: dragBlock.endHour - dragBlock.startHour,
                reservationId: dragBlock.detail.id,
                status: dragBlock.detail.status,
              });
            }}
            onDrop={handleDrop}
            onResizeStart={(event, resizeBlock, edge, dateParam) => {
              event.preventDefault();
              event.stopPropagation();
              setDropError(null);
              setDraggedReservation(null);
              setDragOverSlotKey(null);
              setResizingReservation({
                dateParam,
                edge,
                endHour: resizeBlock.endHour,
                reservationId: resizeBlock.detail.id,
                startHour: resizeBlock.startHour,
                status: resizeBlock.detail.status,
              });
            }}
            onSetDragOverSlotKey={setDragOverSlotKey}
            resizeOverSlotKey={resizeOverSlotKey}
            resizingReservation={resizingReservation}
            reservationBlocksByDate={reservationBlocksByDate}
          />
        </>
      )}
    </section>
  );
}
