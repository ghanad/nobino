"use client";

import { useActionState, useEffect, useState } from "react";

import {
  cancelMeetingRoomReservationAction,
  type CancelMeetingRoomReservationActionState,
} from "@/app/meeting-rooms/actions";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: CancelMeetingRoomReservationActionState = {
  message: "",
  status: "idle",
};

export function MeetingRoomCancelForm({
  date,
  reservationId,
  roomId,
}: {
  date: string;
  reservationId: string;
  roomId: string;
}) {
  const [state, action] = useActionState(
    cancelMeetingRoomReservationAction,
    initialState,
  );
  const [isCancelled, setIsCancelled] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      setIsCancelled(true);
    }
  }, [state.status]);

  if (isCancelled) {
    return <p className="mt-2 text-xs text-emerald-700">رزرو لغو شد.</p>;
  }

  return (
    <form action={action} className="mt-2">
      <input name="reservationId" type="hidden" value={reservationId} />
      <input name="roomId" type="hidden" value={roomId} />
      <input name="date" type="hidden" value={date} />
      <SubmitButton
        className="h-8 px-3 text-xs"
        pendingLabel="در حال لغو"
        variant="outline"
      >
        لغو
      </SubmitButton>
      {state.status === "error" ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
