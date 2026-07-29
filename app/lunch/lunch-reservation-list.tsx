"use client";

/*
 * THESIS: A Jalali workweek becomes one service line, not a stack of SaaS cards.
 * OWN-WORLD: Crisp route geometry, ink-and-blue controls, and semantic station dots.
 * STORY: Scan day status, choose meals and pickup inline, then submit once.
 * FIRST VIEWPORT: Week summary above a connected vertical line; nearest open day leads.
 * FORM: Office wayfinding map, fourth grounded direction, seed 080204f5.
 */

import { useActionState, useCallback, useEffect, useState } from "react";
import {
  Building2,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Coffee,
  Pencil,
  Utensils,
  X,
  XCircle,
} from "lucide-react";

import {
  cancelLunchReservationAction,
  createLunchReservationAction,
  type LunchActionState,
  updateLunchReservationAction,
} from "@/app/lunch/actions";
import { SwipeDismissToast } from "@/components/ui/swipe-dismiss-toast";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

type LunchLocation = {
  id: string;
  name: string;
};

type LunchReservationRow = {
  availabilityLabel: string;
  availabilityVariant: "closed" | "no-service" | "open";
  cutoffLabel: string;
  dateLabel: string;
  dateParam: string;
  isActionDisabled: boolean;
  isOpen: boolean;
  reservation: {
    id: string;
    locationId: string;
    locationName: string;
    breakfastReserved: boolean;
    lunchReserved: boolean;
  } | null;
  weekdayLabel: string;
};

type ActionToast = {
  id: number;
  message: string;
  variant: "error" | "success";
};

type LunchReservationListProps = {
  locations: LunchLocation[];
  rows: LunchReservationRow[];
};

const initialActionState: LunchActionState = {
  message: "",
  status: "idle",
};

function LocationSelect({
  className,
  currentLocationId,
  dateLabel,
  disabled,
  locations,
}: {
  className?: string;
  currentLocationId?: string;
  dateLabel: string;
  disabled: boolean;
  locations: LunchLocation[];
}) {
  return (
    <label className={cn("grid min-w-0 gap-2 text-sm", className)}>
      <span className="text-xs font-semibold text-foreground">محل تحویل</span>
      <span className="relative block">
        <Building2
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <select
          aria-label={`محل تحویل ${dateLabel}`}
          className="h-12 w-full appearance-none rounded-xl border border-input bg-background px-9 text-sm font-medium outline-none transition-[border-color,box-shadow,background-color] hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60 sm:h-11"
          defaultValue={currentLocationId ?? locations[0]?.id ?? ""}
          disabled={disabled || locations.length === 0}
          name="locationId"
          required
        >
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
      </span>
    </label>
  );
}

function MealChoices({
  breakfastChecked,
  breakfastReserved = false,
  className,
  disabled,
  lunchChecked,
  lunchReserved = true,
  onBreakfastChange,
  onLunchChange,
  showBreakfast = true,
  showLunch = true,
}: {
  breakfastChecked?: boolean;
  breakfastReserved?: boolean;
  className?: string;
  disabled: boolean;
  lunchChecked?: boolean;
  lunchReserved?: boolean;
  onBreakfastChange?: (checked: boolean) => void;
  onLunchChange?: (checked: boolean) => void;
  showBreakfast?: boolean;
  showLunch?: boolean;
}) {
  const choiceClassName =
    "relative flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-1 font-semibold text-muted-foreground transition-[color,background-color,border-color,transform] hover:border-primary/40 hover:text-foreground active:translate-y-px has-[:checked]:border-primary/45 has-[:checked]:bg-primary/[0.06] has-[:checked]:text-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/35 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 motion-reduce:transform-none";
  const availableMealCount = Number(showBreakfast) + Number(showLunch);

  return (
    <fieldset
      className={cn(
        "min-w-0 text-sm md:w-72 md:shrink-0",
        className,
      )}
    >
      <legend className="sr-only">انتخاب وعده‌ها</legend>
      <div className="mb-2 text-xs font-semibold text-foreground">
        انتخاب وعده‌ها
      </div>
      <div
        className={cn(
          "grid gap-2",
          availableMealCount === 1 ? "grid-cols-1" : "grid-cols-2",
        )}
      >
        {showBreakfast ? (
          <label className={choiceClassName}>
            <input
              className="sr-only"
              checked={breakfastChecked}
              defaultChecked={breakfastChecked === undefined ? breakfastReserved : undefined}
              disabled={disabled}
              name="breakfastReserved"
              onChange={(event) => onBreakfastChange?.(event.target.checked)}
              type="checkbox"
            />
            <Coffee aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="min-w-0">صبحانه</span>
          </label>
        ) : null}
        {showLunch ? (
          <label className={choiceClassName}>
            <input
              className="sr-only"
              checked={lunchChecked}
              defaultChecked={lunchChecked === undefined ? lunchReserved : undefined}
              disabled={disabled}
              name="lunchReserved"
              onChange={(event) => onLunchChange?.(event.target.checked)}
              type="checkbox"
            />
            <Utensils aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="min-w-0">ناهار</span>
          </label>
        ) : null}
      </div>
    </fieldset>
  );
}

function getCreateReservationLabel({
  breakfastReserved,
  lunchReserved,
}: {
  breakfastReserved: boolean;
  lunchReserved: boolean;
}) {
  if (breakfastReserved && lunchReserved) {
    return "ثبت رزرو صبحانه و ناهار";
  }

  if (breakfastReserved) {
    return "رزرو صبحانه";
  }

  if (lunchReserved) {
    return "رزرو ناهار";
  }

  return "ثبت رزرو";
}

function LunchActionToast({
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
      className={`fixed right-6 top-6 z-50 flex w-[min(420px,calc(100vw-3rem))] items-start gap-3 rounded-lg border bg-background p-4 text-sm shadow-lg ${
        toast.variant === "error"
          ? "border-destructive/30 text-destructive"
          : "border-emerald-200 text-emerald-900"
      }`}
      onDismiss={onDismiss}
      role={toast.variant === "error" ? "alert" : "status"}
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

function ActionResultBridge({
  onComplete,
  state,
}: {
  onComplete: (state: LunchActionState) => void;
  state: LunchActionState;
}) {
  useEffect(() => {
    if (state.status === "idle") {
      return;
    }

    onComplete(state);
  }, [onComplete, state]);

  return null;
}

function CreateLunchReservationForm({
  disabled,
  locations,
  onComplete,
  row,
}: {
  disabled: boolean;
  locations: LunchLocation[];
  onComplete: (state: LunchActionState) => void;
  row: LunchReservationRow;
}) {
  const [state, formAction] = useActionState(
    createLunchReservationAction,
    initialActionState,
  );
  const [breakfastReserved, setBreakfastReserved] = useState(false);
  const [lunchReserved, setLunchReserved] = useState(true);
  const hasSelectedMeal = breakfastReserved || lunchReserved;

  return (
    <form
      action={formAction}
      className="grid gap-3 md:w-fit md:grid-cols-[18rem_15rem_11rem] md:items-end"
    >
      <ActionResultBridge onComplete={onComplete} state={state} />
      <input name="date" type="hidden" value={row.dateParam} />
      <MealChoices
        breakfastChecked={breakfastReserved}
        disabled={disabled}
        lunchChecked={lunchReserved}
        onBreakfastChange={setBreakfastReserved}
        onLunchChange={setLunchReserved}
      />
      <LocationSelect
        className="w-full"
        dateLabel={`${row.weekdayLabel} ${row.dateLabel}`}
        disabled={disabled}
        locations={locations}
      />
      <SubmitButton
        className="h-12 w-full rounded-xl sm:h-11 md:min-w-0"
        disabled={disabled || !hasSelectedMeal}
        pendingLabel="در حال ثبت"
      >
        {getCreateReservationLabel({ breakfastReserved, lunchReserved })}
      </SubmitButton>
    </form>
  );
}

function UpdateLunchReservationForm({
  disabled,
  locations,
  onComplete,
  row,
}: {
  disabled: boolean;
  locations: LunchLocation[];
  onComplete: (state: LunchActionState) => void;
  row: LunchReservationRow & {
    reservation: NonNullable<LunchReservationRow["reservation"]>;
  };
}) {
  const [state, formAction] = useActionState(
    updateLunchReservationAction,
    initialActionState,
  );

  return (
    <form
      action={formAction}
      className="grid gap-3 md:w-fit md:grid-cols-[18rem_15rem_7rem] md:items-end"
    >
      <ActionResultBridge onComplete={onComplete} state={state} />
      <input name="reservationId" type="hidden" value={row.reservation.id} />
      <input name="date" type="hidden" value={row.dateParam} />
      <MealChoices
        breakfastReserved={row.reservation.breakfastReserved}
        disabled={disabled}
        lunchReserved={row.reservation.lunchReserved}
      />
      <LocationSelect
        className="w-full"
        currentLocationId={row.reservation.locationId}
        dateLabel={`${row.weekdayLabel} ${row.dateLabel}`}
        disabled={disabled}
        locations={locations}
      />
      <SubmitButton
        className="h-12 w-full rounded-xl sm:h-11 md:min-w-0"
        disabled={disabled}
        pendingLabel="در حال تغییر"
        variant="outline"
      >
        <Pencil className="h-4 w-4" />
        تغییر
      </SubmitButton>
    </form>
  );
}

function CancelLunchReservationForm({
  disabled,
  dateLabel,
  onComplete,
  reservationId,
  weekdayLabel,
}: {
  disabled: boolean;
  dateLabel: string;
  onComplete: (state: LunchActionState) => void;
  reservationId: string;
  weekdayLabel: string;
}) {
  const [state, formAction] = useActionState(
    cancelLunchReservationAction,
    initialActionState,
  );

  return (
    <form
      action={formAction}
      className="w-full md:w-24"
      onSubmit={(event) => {
        if (
          !window.confirm(
            `رزرو غذای ${weekdayLabel} ${dateLabel} لغو شود؟`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <ActionResultBridge onComplete={onComplete} state={state} />
      <input name="reservationId" type="hidden" value={reservationId} />
      <SubmitButton
        className="h-11 w-full rounded-xl text-muted-foreground hover:text-destructive"
        disabled={disabled}
        pendingLabel="در حال لغو"
        variant="outline"
      >
        <X className="h-4 w-4" />
        لغو
      </SubmitButton>
    </form>
  );
}

function getAvailabilityClasses(
  variant: LunchReservationRow["availabilityVariant"],
) {
  if (variant === "open") {
    return "bg-emerald-50 text-emerald-800";
  }

  if (variant === "closed") {
    return "bg-slate-100 text-slate-600";
  }

  return "bg-rose-50 text-rose-800";
}

function applyActionMutation(
  rows: LunchReservationRow[],
  mutation: NonNullable<LunchActionState["mutation"]>,
) {
  if (mutation.type === "cancel") {
    return rows.map((row) =>
      row.reservation?.id === mutation.reservationId
        ? { ...row, reservation: null }
        : row,
    );
  }

  return rows.map((row) =>
    row.dateParam === mutation.dateParam
      ? { ...row, reservation: mutation.reservation }
      : row,
  );
}

function getReservationMealLabel(
  reservation: NonNullable<LunchReservationRow["reservation"]>,
) {
  return [
    reservation.breakfastReserved ? "صبحانه" : null,
    reservation.lunchReserved ? "ناهار" : null,
  ]
    .filter(Boolean)
    .join(" و ");
}

export function LunchReservationList({
  locations,
  rows,
}: LunchReservationListProps) {
  const [currentRows, setCurrentRows] = useState(rows);
  const [toast, setToast] = useState<ActionToast | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    setCurrentRows(rows);
  }, [rows]);

  const handleActionComplete = useCallback(
    (state: LunchActionState) => {
      const mutation = state.mutation;

      setToast({
        id: Date.now(),
        message: state.message,
        variant: state.status === "error" ? "error" : "success",
      });

      if (state.status === "success" && mutation) {
        setCurrentRows((previousRows) =>
          applyActionMutation(previousRows, mutation),
        );
      }
    },
    [],
  );
  const nextReservationRow = currentRows.find((row) => row.reservation);

  return (
    <>
      <LunchActionToast onDismiss={dismissToast} toast={toast} />
      {nextReservationRow?.reservation ? (
        <div className="flex flex-col gap-1 rounded-xl bg-primary/[0.05] px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-2">
          <span className="font-semibold text-primary">رزرو بعدی شما:</span>
          <span className="text-foreground">
            {nextReservationRow.weekdayLabel} {nextReservationRow.dateLabel}
            <span className="mx-1.5 text-muted-foreground">·</span>
            {getReservationMealLabel(nextReservationRow.reservation)}
            <span className="mx-1.5 text-muted-foreground">·</span>
            تحویل از {nextReservationRow.reservation.locationName}
          </span>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-background">
        {currentRows.map((row) => {
          const reservation = row.reservation;
          const isUnavailable = !row.isOpen;
          const isActionDisabled =
            row.isActionDisabled || locations.length === 0;

          return (
            <article
              className={cn(
                "group grid grid-cols-[5.5rem_minmax(0,1fr)] border-b border-border/70 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)]",
                isUnavailable && "bg-slate-50/70",
              )}
              key={row.dateParam}
            >
              <div
                className={cn(
                  "relative border-l border-border/80 px-3 sm:px-5",
                  isUnavailable ? "py-3" : "py-5",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute -left-[7px] h-[13px] w-[13px] rounded-full border-[3px] border-background",
                    isUnavailable ? "top-5" : "top-7",
                    row.isOpen
                      ? reservation
                        ? "bg-primary"
                        : "bg-emerald-500"
                      : row.availabilityVariant === "no-service"
                        ? "bg-rose-300"
                        : "bg-slate-300",
                  )}
                />
                <h3 className="text-sm font-bold leading-6 text-foreground sm:text-base">
                  {row.weekdayLabel}
                </h3>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground sm:text-sm">
                  {row.dateLabel}
                </p>
                <span
                  className={cn(
                    "inline-flex min-h-6 w-fit items-center rounded-md px-1.5 text-xs font-semibold",
                    isUnavailable ? "mt-1" : "mt-2",
                    getAvailabilityClasses(row.availabilityVariant),
                  )}
                >
                  {row.availabilityLabel}
                </span>
              </div>

              {row.isOpen ? (
                <div className="min-w-0 px-3 py-5 sm:px-6">
                  <div className="mb-3 flex flex-col gap-2 border-b border-border/60 pb-3 sm:flex-row sm:items-center sm:justify-between">
                    {reservation ? (
                      <p className="flex items-start gap-2 text-sm font-medium leading-6 text-emerald-800">
                        <CheckCircle2
                          aria-hidden="true"
                          className="mt-1 h-4 w-4 shrink-0"
                        />
                        <span>
                          {getReservationMealLabel(reservation)}
                          <span className="mx-1.5 text-emerald-600/60">·</span>
                          تحویل از {reservation.locationName}
                        </span>
                      </p>
                    ) : (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Utensils aria-hidden="true" className="h-4 w-4" />
                        هنوز رزرو نشده
                      </p>
                    )}
                    <p className="flex items-center gap-1.5 text-xs leading-5 text-muted-foreground">
                      <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                      {row.cutoffLabel}
                    </p>
                  </div>

                  {reservation ? (
                    <div className="grid gap-3 md:w-fit md:grid-cols-[auto_6rem] md:items-end">
                        <UpdateLunchReservationForm
                          disabled={isActionDisabled}
                          locations={locations}
                          onComplete={handleActionComplete}
                          row={{
                            ...row,
                            reservation,
                          }}
                        />
                        <CancelLunchReservationForm
                          dateLabel={row.dateLabel}
                          disabled={isActionDisabled}
                          onComplete={handleActionComplete}
                          reservationId={reservation.id}
                          weekdayLabel={row.weekdayLabel}
                        />
                    </div>
                  ) : (
                    <CreateLunchReservationForm
                      disabled={isActionDisabled}
                      locations={locations}
                      onComplete={handleActionComplete}
                      row={row}
                    />
                  )}
                </div>
              ) : (
                <div className="flex min-w-0 items-center px-3 py-3 sm:px-6">
                  <p className="text-sm leading-6 text-muted-foreground">
                    {row.availabilityVariant === "closed"
                      ? "مهلت رزرو این روز گذشته است."
                      : "در این روز سرویس غذا ارائه نمی‌شود."}
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
