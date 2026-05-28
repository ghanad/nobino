"use client";

import { CalendarClock, Check, X } from "lucide-react";
import { useState } from "react";

import {
  approveReservationAction,
  proposeAlternativeAction,
  rejectReservationAction,
} from "@/app/manager/actions";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { JALALI_DATE_INPUT_PLACEHOLDER } from "@/lib/jalali-date";

type ReviewAction = "reject" | "time" | null;

type PendingReviewModalContentProps = {
  dateParam: string;
  defaultEndHour: number;
  defaultStartHour: number;
  durationLabel: string;
  hourOptions: number[];
  partySizeLabel: string;
  reason: string | null;
  requestedDate: string;
  requestedDateLabel: string;
  requestedEndTimeLabel: string;
  requestedStartTimeLabel: string;
  reservationId: string;
  resourcePoolName: string;
  userEmail: string;
  userName: string;
};

export function PendingReviewModalContent({
  dateParam,
  defaultEndHour,
  defaultStartHour,
  durationLabel,
  hourOptions,
  partySizeLabel,
  reason,
  requestedDate,
  requestedDateLabel,
  requestedEndTimeLabel,
  requestedStartTimeLabel,
  reservationId,
  resourcePoolName,
  userEmail,
  userName,
}: PendingReviewModalContentProps) {
  const [activeAction, setActiveAction] = useState<ReviewAction>(null);

  return (
    <div className="p-5 text-card-foreground">
      <div className="grid gap-5">
        <div className="grid gap-3">
          <div>
            <h3 className="text-base font-semibold" dir="auto">
              {userName}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground" dir="auto">
              {userEmail}
            </p>
          </div>

          <div className="rounded-md bg-muted/35 p-4">
            <p className="text-sm font-medium" dir="auto">
              {resourcePoolName}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              <span>{requestedDateLabel}</span>
              <span> · </span>
              <bdi dir="ltr">{requestedStartTimeLabel}</bdi>
              <span> تا </span>
              <bdi dir="ltr">{requestedEndTimeLabel}</bdi>
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              مدت:{" "}
              <span className="font-medium text-foreground">{durationLabel}</span>
              <span className="text-muted-foreground"> · </span>
              تعداد افراد:{" "}
              <span className="font-medium text-foreground">{partySizeLabel}</span>
            </p>
          </div>

          {reason?.trim() ? (
            <div>
              <p className="text-sm font-medium">دلیل درخواست:</p>
              <p className="mt-2 rounded-md border bg-background px-3 py-2 text-sm leading-6 text-muted-foreground">
                {reason}
              </p>
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 border-t pt-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <form action={approveReservationAction} className="sm:flex-1">
              <input name="reservationId" type="hidden" value={reservationId} />
              <input name="date" type="hidden" value={dateParam} />
              <SubmitButton
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                pendingLabel="در حال تایید..."
              >
                <Check className="h-4 w-4" />
                تایید درخواست
              </SubmitButton>
            </form>

            <Button
              className="sm:flex-1"
              onClick={() =>
                setActiveAction(activeAction === "time" ? null : "time")
              }
              type="button"
              variant="outline"
            >
              <CalendarClock className="h-4 w-4" />
              تغییر زمان
            </Button>

            <Button
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 sm:flex-1"
              onClick={() =>
                setActiveAction(activeAction === "reject" ? null : "reject")
              }
              type="button"
              variant="outline"
            >
              <X className="h-4 w-4" />
              رد درخواست
            </Button>
          </div>

          {activeAction === "time" ? (
            <form
              action={proposeAlternativeAction}
              className="grid gap-3 rounded-md border bg-muted/25 p-4"
            >
              <input name="reservationId" type="hidden" value={reservationId} />
              <input name="date" type="hidden" value={dateParam} />
              <div className="grid gap-2">
                <label
                  className="text-sm font-medium text-muted-foreground"
                  htmlFor={`modal-proposedDate-${reservationId}`}
                >
                  تاریخ جدید
                </label>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={requestedDate}
                  dir="ltr"
                  id={`modal-proposedDate-${reservationId}`}
                  name="proposedDate"
                  pattern="\d{4}[-/]\d{1,2}[-/]\d{1,2}"
                  placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
                  title={`تاریخ جلالی مثل ${JALALI_DATE_INPUT_PLACEHOLDER} وارد کنید`}
                  type="text"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label
                    className="text-sm font-medium text-muted-foreground"
                    htmlFor={`modal-proposedStartHour-${reservationId}`}
                  >
                    ساعت شروع
                  </label>
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue={defaultStartHour}
                    id={`modal-proposedStartHour-${reservationId}`}
                    name="proposedStartHour"
                  >
                    {hourOptions.slice(0, 23).map((hour) => (
                      <option key={hour} value={hour}>
                        {hour.toString().padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <label
                    className="text-sm font-medium text-muted-foreground"
                    htmlFor={`modal-proposedEndHour-${reservationId}`}
                  >
                    ساعت پایان
                  </label>
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue={defaultEndHour}
                    id={`modal-proposedEndHour-${reservationId}`}
                    name="proposedEndHour"
                  >
                    {hourOptions.slice(1).map((hour) => (
                      <option key={hour} value={hour}>
                        {hour.toString().padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  onClick={() => setActiveAction(null)}
                  type="button"
                  variant="ghost"
                >
                  انصراف
                </Button>
                <SubmitButton pendingLabel="در حال ثبت..." variant="secondary">
                  <CalendarClock className="h-4 w-4" />
                  ثبت زمان جدید
                </SubmitButton>
              </div>
            </form>
          ) : null}

          {activeAction === "reject" ? (
            <form
              action={rejectReservationAction}
              className="grid gap-3 rounded-md border border-red-100 bg-red-50/40 p-4"
              onSubmit={(event) => {
                if (!confirm("آیا از رد این درخواست مطمئن هستید؟")) {
                  event.preventDefault();
                }
              }}
            >
              <input name="reservationId" type="hidden" value={reservationId} />
              <input name="date" type="hidden" value={dateParam} />
              <div className="grid gap-2">
                <label
                  className="text-sm font-medium text-muted-foreground"
                  htmlFor={`modal-rejectionReason-${reservationId}`}
                >
                  دلیل رد درخواست
                </label>
                <textarea
                  className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  id={`modal-rejectionReason-${reservationId}`}
                  maxLength={500}
                  name="rejectionReason"
                />
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  onClick={() => setActiveAction(null)}
                  type="button"
                  variant="ghost"
                >
                  انصراف
                </Button>
                <SubmitButton
                  className="bg-red-600 text-white hover:bg-red-700"
                  pendingLabel="در حال رد..."
                >
                  <X className="h-4 w-4" />
                  ثبت رد درخواست
                </SubmitButton>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
