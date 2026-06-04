"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  CircleSlash,
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
  } | null;
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
        "h-10 min-w-40 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60",
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
    <div
      className={`fixed right-6 top-6 z-50 flex w-[min(420px,calc(100vw-3rem))] items-start gap-3 rounded-lg border bg-background p-4 text-sm shadow-lg ${
        toast.variant === "error"
          ? "border-destructive/30 text-destructive"
          : "border-emerald-200 text-emerald-900"
      }`}
      role="status"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="leading-6">{toast.message}</p>
    </div>
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
  isOpen,
  locations,
  onComplete,
  row,
}: {
  disabled: boolean;
  isOpen: boolean;
  locations: LunchLocation[];
  onComplete: (state: LunchActionState) => void;
  row: LunchReservationRow;
}) {
  const [state, formAction] = useActionState(
    createLunchReservationAction,
    initialActionState,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <ActionResultBridge onComplete={onComplete} state={state} />
      <input name="date" type="hidden" value={row.dateParam} />
      <LocationSelect
        className="w-full sm:w-auto"
        disabled={disabled}
        locations={locations}
      />
      <SubmitButton
        className="w-full sm:w-auto"
        disabled={disabled}
        pendingLabel="در حال ثبت"
      >
        {isOpen ? (
          <Utensils className="h-4 w-4" />
        ) : (
          <CircleSlash className="h-4 w-4" />
        )}
        رزرو
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
      className="contents sm:flex sm:items-center sm:gap-2"
    >
      <ActionResultBridge onComplete={onComplete} state={state} />
      <input name="reservationId" type="hidden" value={row.reservation.id} />
      <input name="date" type="hidden" value={row.dateParam} />
      <LocationSelect
        className="col-span-2 w-full sm:w-auto"
        currentLocationId={row.reservation.locationId}
        disabled={disabled}
        locations={locations}
      />
      <SubmitButton
        className="w-full sm:w-auto"
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
          const isActionDisabled =
            row.isActionDisabled || locations.length === 0;

          return (
            <div
              className="grid gap-4 rounded-md border bg-background p-4 md:grid-cols-[1fr_auto] md:items-center"
              key={row.dateParam}
            >
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">{row.dateLabel}</h2>
                  <span
                    className={cn(
                      "inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium ring-1",
                      getAvailabilityClasses(row.availabilityVariant),
                    )}
                  >
                    {row.availabilityLabel}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {row.cutoffLabel}
                </p>
                {reservation ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-800">
                    <Building2 className="h-4 w-4" />
                    رزرو شده برای دریافت از {reservation.locationName}
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Utensils className="h-4 w-4" />
                    برای این روز رزرو ناهار ندارید.
                  </p>
                )}
              </div>

              <div
                className={cn(
                  reservation
                    ? "grid grid-cols-2 gap-2 sm:flex sm:items-center"
                    : "flex flex-col gap-2 sm:flex-row sm:items-center",
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
                    isOpen={row.isOpen}
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
