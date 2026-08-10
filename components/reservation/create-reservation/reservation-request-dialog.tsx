"use client";

import { X } from "lucide-react";

import {
  formatPersianHour,
  formatPersianNumber,
} from "@/components/reservation/create-reservation/formatters";
import type {
  LunchAvailability,
  LunchPrompt,
  Selection,
  WeekDay,
} from "@/components/reservation/create-reservation/types";
import { SubmitButton } from "@/components/ui/submit-button";

export function ReservationRequestDialog({
  canSubmitLunchReservation,
  clearSelection,
  dailyUserHourLimit,
  hasActiveReservationForSelectedDay,
  isOpen,
  isSelectionBlocked,
  isSelectionOverDailyLimit,
  lunchAvailability,
  lunchFormAction,
  lunchPrompt,
  partySize,
  reservedHoursForSelectedDay,
  selectedDailyTotal,
  selection,
  setIsReasonDialogOpen,
  setPartySize,
  weekDays,
}: {
  canSubmitLunchReservation: boolean;
  clearSelection: () => void;
  dailyUserHourLimit: number;
  hasActiveReservationForSelectedDay: boolean;
  isOpen: boolean;
  isSelectionBlocked: boolean;
  isSelectionOverDailyLimit: boolean;
  lunchAvailability: LunchAvailability | null;
  lunchFormAction: (formData: FormData) => void;
  lunchPrompt: LunchPrompt | null;
  partySize: number;
  reservedHoursForSelectedDay: number;
  selectedDailyTotal: number;
  selection: Selection | null;
  setIsReasonDialogOpen: (value: boolean) => void;
  setPartySize: (value: number) => void;
  weekDays: WeekDay[];
}) {
  if (!isOpen) {
    return null;
  }

  function closeDialog() {
    if (lunchPrompt) {
      clearSelection();
      return;
    }

    setIsReasonDialogOpen(false);
  }

  const hasLunchBuildingConflict = Boolean(
    lunchPrompt &&
      lunchAvailability?.existingReservation &&
      lunchAvailability.existingReservation.buildingId !==
        lunchPrompt.sourceBuildingId,
  );

  return (
    <div
      aria-labelledby="reservation-reason-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      role="dialog"
    >
      <button
        aria-label="بستن فرم درخواست"
        className="absolute inset-0 cursor-default"
        onClick={closeDialog}
        type="button"
      />
      <div className="relative z-10 grid max-h-[92vh] w-full max-w-lg gap-5 overflow-y-auto rounded-t-lg border bg-background p-5 shadow-lg sm:rounded-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-medium" id="reservation-reason-dialog-title">
              {lunchPrompt ? "رزرو غذا" : "تکمیل درخواست رزرو"}
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
            onClick={closeDialog}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        {lunchPrompt ? (
          <>
            <div className="grid gap-3 rounded-md border border-sky-100 bg-sky-50/60 p-3 text-sm">
              <p className="font-medium">برای این روز غذا هم رزرو می‌کنید؟</p>
              <p className="text-xs leading-5 text-muted-foreground">
                {lunchAvailability?.cutoffLabel ??
                  "وضعیت رزرو غذا برای این روز مشخص نیست."}
              </p>

              <input name="date" type="hidden" value={lunchPrompt.dateParam} />
              <input
                name="sourceReservationId"
                type="hidden"
                value={lunchPrompt.sourceReservationId}
              />
              <input
                name="buildingId"
                type="hidden"
                value={lunchPrompt.sourceBuildingId}
              />
              {lunchAvailability?.existingReservation ? (
                <input
                  name="reservationId"
                  type="hidden"
                  value={lunchAvailability.existingReservation.id}
                />
              ) : null}

              {canSubmitLunchReservation ? (
                <>
                  <p className="rounded-md border border-sky-200 bg-white/80 px-3 py-2 text-xs font-medium leading-5 text-sky-950">
                    تحویل غذا در ساختمان {lunchPrompt.sourceBuildingName}
                  </p>
                  {hasLunchBuildingConflict ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950" role="alert">
                      برای این روز غذا در ساختمان {lunchAvailability?.existingReservation?.buildingName} رزرو شده است. با ادامه، محل تحویل به ساختمان {lunchPrompt.sourceBuildingName} تغییر می‌کند.
                    </p>
                  ) : null}
                  <fieldset className="grid gap-2 rounded-md border bg-white/70 p-3">
                    <legend className="px-1 font-medium">وعده‌ها</legend>
                    {lunchPrompt.canOfferBreakfast ? (
                      <label className="flex items-center gap-2">
                        <input
                          defaultChecked={
                            lunchAvailability?.existingReservation
                              ?.breakfastReserved ?? false
                          }
                          name="breakfastReserved"
                          type="checkbox"
                        />
                        صبحانه
                      </label>
                    ) : lunchAvailability?.existingReservation
                        ?.breakfastReserved ? (
                      <>
                        <input name="breakfastReserved" type="hidden" value="on" />
                        <p className="text-xs text-muted-foreground">
                          صبحانه‌ای که قبلاً رزرو کرده‌اید بدون تغییر باقی می‌ماند.
                        </p>
                      </>
                    ) : null}
                    <label className="flex items-center gap-2">
                      <input
                        defaultChecked={
                          lunchAvailability?.existingReservation?.lunchReserved ??
                          true
                        }
                        name="lunchReserved"
                        type="checkbox"
                      />
                      ناهار
                    </label>
                  </fieldset>
                </>
              ) : (
                <p className="rounded-md border border-amber-200 bg-white/80 px-3 py-2 text-xs leading-5 text-amber-900">
                  {lunchAvailability?.unavailableReason ??
                    "در حال حاضر امکان رزرو غذا برای این تاریخ وجود ندارد."}
                </p>
              )}

              {lunchPrompt.partySize > 1 ? (
                <p className="rounded-md border border-amber-200 bg-white/80 px-3 py-2 text-xs leading-5 text-amber-900">
                  غذا فقط برای خود شما رزرو می‌شود. نفرات دیگر باید با حساب
                  کاربری خودشان غذا رزرو کنند.
                </p>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="inline-flex h-11 w-full items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent sm:h-10 sm:w-auto"
                onClick={clearSelection}
                type="button"
              >
                {hasLunchBuildingConflict
                  ? `حفظ رزرو در ${lunchAvailability?.existingReservation?.buildingName}`
                  : "فعلاً نه"}
              </button>
              <SubmitButton
                className="h-11 w-full sm:h-10 sm:w-auto"
                disabled={!canSubmitLunchReservation}
                formAction={lunchFormAction}
                pendingLabel="در حال ثبت غذا..."
              >
                {hasLunchBuildingConflict
                  ? `تغییر تحویل به ${lunchPrompt.sourceBuildingName}`
                  : "ذخیره رزرو غذا"}
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
                شما نمی‌توانید بیش از {formatPersianNumber(dailyUserHourLimit)}{" "}
                ساعت در یک روز رزرو کنید. در این روز قبلا{" "}
                {formatPersianNumber(reservedHoursForSelectedDay)} ساعت رزرو فعال
                دارید.
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
                دلیل درخواست <span className="text-muted-foreground">(اختیاری)</span>
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
  );
}
