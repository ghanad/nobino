"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import {
  Building2,
  Check,
  CheckCircle2,
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
  disabled,
  locations,
}: {
  className?: string;
  currentLocationId?: string;
  disabled: boolean;
  locations: LunchLocation[];
}) {
  return (
    <select
      className={cn(
        "h-11 min-w-40 rounded-lg border-0 bg-muted/70 px-3 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:opacity-60 sm:h-10 sm:rounded-md sm:border sm:border-input sm:bg-background",
        className,
      )}
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
    "relative flex min-h-11 min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-1 font-medium text-foreground/80 transition-[color,background-color,border-color,box-shadow,transform] hover:border-primary/30 hover:bg-primary/[0.03] active:scale-[0.99] active:border-primary/40 active:bg-primary/[0.06] has-[:checked]:border-primary/35 has-[:checked]:bg-primary/[0.06] has-[:checked]:text-primary has-[:checked]:hover:border-primary/45 has-[:checked]:hover:bg-primary/[0.09] has-[:checked]:active:bg-primary/[0.12] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-muted-foreground/40 has-[:focus-visible]:ring-offset-1 has-[:focus-visible]:ring-offset-background has-[:disabled]:cursor-not-allowed has-[:disabled]:border-border/70 has-[:disabled]:bg-muted has-[:disabled]:text-muted-foreground has-[:disabled]:hover:border-border/70 has-[:disabled]:hover:bg-muted has-[:disabled]:active:scale-100 has-[:disabled]:active:border-border/70 has-[:disabled]:active:bg-muted motion-reduce:transform-none sm:min-h-10 sm:hover:border-primary/40 sm:hover:bg-muted/50 sm:active:scale-[0.98] sm:active:bg-muted sm:has-[:checked]:border-primary sm:has-[:checked]:bg-primary/10 sm:has-[:checked]:hover:bg-primary/15 sm:has-[:checked]:active:bg-primary/20";
  const indicatorClassName =
    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-muted-foreground/60 bg-background text-transparent transition-colors peer-checked:border-primary/60 peer-checked:bg-primary peer-checked:text-primary-foreground peer-disabled:!border-muted-foreground/30 peer-disabled:!bg-muted-foreground/10 peer-disabled:!text-muted-foreground/50 sm:h-6 sm:w-6 sm:border-2 md:h-5 md:w-5 md:border md:border-muted-foreground/45";
  const availableMealCount = Number(showBreakfast) + Number(showLunch);

  return (
    <fieldset
      className={cn(
        "grid min-w-0 gap-1 rounded-lg border border-border/70 bg-muted/50 p-1 text-sm sm:gap-2 sm:rounded-md sm:bg-transparent sm:p-2 md:w-72 md:shrink-0",
        availableMealCount === 1 ? "grid-cols-1" : "grid-cols-2",
        className,
      )}
    >
      <legend className="sr-only">انتخاب وعده‌ها</legend>
      {showBreakfast ? (
        <label className={choiceClassName}>
          <input
            className="peer sr-only"
            checked={breakfastChecked}
            defaultChecked={breakfastChecked === undefined ? breakfastReserved : undefined}
            disabled={disabled}
            name="breakfastReserved"
            onChange={(event) => onBreakfastChange?.(event.target.checked)}
            type="checkbox"
          />
          <span className="min-w-0">صبحانه</span>
          <span aria-hidden="true" className={indicatorClassName}>
            <Check
              className="h-3 w-3 sm:h-4 sm:w-4 md:h-3 md:w-3"
              strokeWidth={2.5}
            />
          </span>
        </label>
      ) : null}
      {showLunch ? (
        <label className={choiceClassName}>
          <input
            className="peer sr-only"
            checked={lunchChecked}
            defaultChecked={lunchChecked === undefined ? lunchReserved : undefined}
            disabled={disabled}
            name="lunchReserved"
            onChange={(event) => onLunchChange?.(event.target.checked)}
            type="checkbox"
          />
          <span className="min-w-0">ناهار</span>
          <span aria-hidden="true" className={indicatorClassName}>
            <Check
              className="h-3 w-3 sm:h-4 sm:w-4 md:h-3 md:w-3"
              strokeWidth={2.5}
            />
          </span>
        </label>
      ) : null}
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
      role="status"
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
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2 md:grid md:grid-cols-[18rem_10rem_13rem]"
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
        className="w-full sm:w-auto md:min-w-0 md:w-full"
        disabled={disabled}
        locations={locations}
      />
      <SubmitButton
        className="w-full sm:w-auto md:min-w-0 md:w-full"
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
      className="contents sm:flex sm:items-center sm:gap-2 md:grid md:grid-cols-[18rem_10rem_5rem]"
    >
      <ActionResultBridge onComplete={onComplete} state={state} />
      <input name="reservationId" type="hidden" value={row.reservation.id} />
      <input name="date" type="hidden" value={row.dateParam} />
      <MealChoices
        breakfastReserved={row.reservation.breakfastReserved}
        className="col-span-2 md:col-span-1"
        disabled={disabled}
        lunchReserved={row.reservation.lunchReserved}
      />
      <LocationSelect
        className="col-span-2 w-full sm:w-auto md:col-span-1 md:min-w-0 md:w-full"
        currentLocationId={row.reservation.locationId}
        disabled={disabled}
        locations={locations}
      />
      <SubmitButton
        className="w-full sm:w-auto md:min-w-0 md:w-full"
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
  onComplete,
  reservationId,
}: {
  disabled: boolean;
  onComplete: (state: LunchActionState) => void;
  reservationId: string;
}) {
  const [state, formAction] = useActionState(
    cancelLunchReservationAction,
    initialActionState,
  );

  return (
    <form action={formAction} className="w-full sm:w-auto">
      <ActionResultBridge onComplete={onComplete} state={state} />
      <input name="reservationId" type="hidden" value={reservationId} />
      <SubmitButton
        className="w-full sm:w-auto"
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
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }

  if (variant === "closed") {
    return "bg-slate-50 text-slate-700 ring-slate-200";
  }

  return "bg-rose-50 text-rose-800 ring-rose-200";
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

  return (
    <>
      <LunchActionToast onDismiss={dismissToast} toast={toast} />
      <div className="grid gap-3">
        {currentRows.map((row) => {
          const reservation = row.reservation;
          const isExpired = row.availabilityVariant === "closed";
          const isActionDisabled =
            row.isActionDisabled || locations.length === 0;

          return (
            <div
              className={cn(
                "grid gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-sm sm:gap-4 sm:p-4 md:grid-cols-[1fr_auto] md:items-center md:rounded-md md:bg-background md:shadow-none",
                isExpired && "border-slate-200 bg-slate-50/70 shadow-none",
              )}
              key={row.dateParam}
            >
              <div className="grid gap-1.5 sm:gap-2">
                <div className="grid gap-1 sm:flex sm:items-center sm:gap-2">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold leading-6">
                      {row.weekdayLabel}
                    </h2>
                    <p className="text-sm font-normal leading-5 text-muted-foreground">
                      {row.dateLabel}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex h-6 w-fit items-center rounded-full px-2 text-[11px] font-medium ring-1 sm:mr-auto",
                      getAvailabilityClasses(row.availabilityVariant),
                    )}
                  >
                    {row.availabilityLabel}
                  </span>
                </div>
                <p
                  className={cn(
                    "text-sm text-muted-foreground",
                    isExpired && "hidden md:block",
                  )}
                >
                  {row.cutoffLabel}
                </p>
                {isExpired ? (
                  <p className="text-sm leading-6 text-slate-700 md:hidden">
                    مهلت ثبت یا تغییر رزرو برای این روز گذشته است.
                  </p>
                ) : null}
                {reservation ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-800">
                    <Building2 className="h-4 w-4" />
                    {[
                      reservation.breakfastReserved ? "صبحانه" : null,
                      reservation.lunchReserved ? "ناهار" : null,
                    ]
                      .filter(Boolean)
                      .join(" و ")}، دریافت از {reservation.locationName}
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    {isExpired ? null : <Utensils className="h-4 w-4" />}
                    رزروی برای این روز ثبت نشده است.
                  </p>
                )}
              </div>

              <div
                className={cn(
                  "border-t border-border/60 pt-3 sm:pt-4 md:border-0 md:pt-0",
                  isExpired
                    ? "hidden md:block"
                    : reservation
                      ? "grid grid-cols-2 gap-2 sm:flex sm:items-center"
                      : "flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2",
                )}
              >
                {reservation ? (
                  <>
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
                      disabled={isActionDisabled}
                      onComplete={handleActionComplete}
                      reservationId={reservation.id}
                    />
                  </>
                ) : (
                  <CreateLunchReservationForm
                    disabled={isActionDisabled}
                    locations={locations}
                    onComplete={handleActionComplete}
                    row={row}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
