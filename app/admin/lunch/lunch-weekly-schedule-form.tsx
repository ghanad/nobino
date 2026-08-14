"use client";

import { Save } from "lucide-react";
import { useActionState, useState } from "react";

import {
  saveLunchWeeklyScheduleAction,
  type LunchWeeklyScheduleActionState,
} from "@/app/admin/lunch/actions";
import {
  ActionResultBridge,
  ReservationsActionToast,
} from "@/components/reservation/create-reservation/action-feedback";
import type { ActionToast } from "@/components/reservation/create-reservation/types";
import { SubmitButton } from "@/components/ui/submit-button";

const WEEKDAY_LABELS: Record<number, string> = {
  0: "یک شنبه",
  1: "دو شنبه",
  2: "سه شنبه",
  3: "چهار شنبه",
  4: "پنج شنبه",
  5: "جمعه",
  6: "شنبه",
};

const initialState: LunchWeeklyScheduleActionState = {
  message: "",
  status: "idle",
};

export function LunchWeeklyScheduleForm({
  days,
}: {
  days: Array<{
    id: string;
    dayOfWeek: number;
    isServiceDay: boolean;
  }>;
}) {
  const [state, formAction] = useActionState(
    saveLunchWeeklyScheduleAction,
    initialState,
  );
  const [toast, setToast] = useState<ActionToast | null>(null);

  function handleActionComplete(nextState: LunchWeeklyScheduleActionState) {
    setToast({
      id: Date.now(),
      message: nextState.message,
      variant: nextState.status === "error" ? "error" : "success",
    });
  }

  return (
    <>
      <ReservationsActionToast
        onDismiss={() => setToast(null)}
        toast={toast}
      />
      <form
        action={formAction}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <ActionResultBridge
          onComplete={handleActionComplete}
          state={state}
        />
        {days.map((day, index) => (
          <div
            className="flex items-center justify-between gap-3 rounded-md border bg-background p-3"
            key={day.id}
          >
            <input
              name={`schedules.${index}.scheduleId`}
              type="hidden"
              value={day.id}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                defaultChecked={day.isServiceDay}
                name={`schedules.${index}.isServiceDay`}
                type="checkbox"
              />
              {WEEKDAY_LABELS[day.dayOfWeek]}
            </label>
          </div>
        ))}
        <div className="flex items-center justify-end sm:col-span-2 lg:col-span-4">
          <SubmitButton pendingLabel="در حال ذخیره">
            <Save className="h-4 w-4" />
            ذخیره برنامه هفتگی
          </SubmitButton>
        </div>
      </form>
    </>
  );
}
