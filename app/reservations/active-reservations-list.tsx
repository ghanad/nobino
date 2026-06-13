"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import type { AlternativeStatus, ReservationStatus } from "@prisma/client";

import type { LunchActionState } from "@/app/lunch/actions";
import {
  cancelReservationByUserInlineAction,
  type CancelReservationActionState,
} from "@/app/reservations/actions";
import { Button } from "@/components/ui/button";
import { formatJalaliDate, formatJalaliDateParam } from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

export type ActiveReservation = {
  id: string;
  startAt: Date;
  endAt: Date;
  partySize: number;
  resourcePoolId: string;
  status: ReservationStatus;
  reason: string | null;
  rejectionReason: string | null;
  resourcePool: {
    name: string;
  };
  alternatives: Array<{
    id: string;
    proposedStartAt: Date;
    proposedEndAt: Date;
    status: AlternativeStatus;
    respondedAt: Date | null;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

type ActionToast = {
  id: number;
  message: string;
  variant: "error" | "success";
};

type ActiveReservationsListProps = {
  activeLunchReservationByDate: Record<string, { id: string }>;
  cancelLunchReservationAction: (
    previousState: LunchActionState,
    formData: FormData,
  ) => Promise<LunchActionState>;
  onReservationCancelled?: (reservation: ActiveReservation) => void;
  reservations: ActiveReservation[];
};

const DISPLAY_TIME_FORMATTER = new Intl.DateTimeFormat("fa-IR", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
});

const initialCancelState: CancelReservationActionState = {
  message: "",
  status: "idle",
};

const initialLunchCancelState: LunchActionState = {
  message: "",
  status: "idle",
};

type LunchCancelPrompt = {
  dateLabel: string;
  reservationId: string;
};

type ActionStateBase = {
  status: "error" | "idle" | "success";
};

function formatDisplayTime(date: Date): string {
  return DISPLAY_TIME_FORMATTER.format(date);
}

function getStatusClass(status: ReservationStatus): string {
  if (status === "PENDING") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (status === "APPROVED") {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }

  if (status === "REJECTED") {
    return "bg-rose-50 text-rose-800 ring-rose-200";
  }

  if (status === "ALTERNATIVE_PROPOSED") {
    return "bg-sky-50 text-sky-800 ring-sky-200";
  }

  return "bg-muted text-muted-foreground ring-border";
}

function getStatusLabel(status: ReservationStatus): string {
  if (status === "PENDING") {
    return "در انتظار تایید";
  }

  if (status === "APPROVED") {
    return "تایید شده";
  }

  if (status === "REJECTED") {
    return "رد شده";
  }

  if (status === "CANCELLED_BY_USER") {
    return "لغو شده توسط شما";
  }

  if (status === "CANCELLED_BY_ADMIN") {
    return "لغو شده توسط مدیر";
  }

  return "نیازمند اقدام";
}

function ReservationTimeRange({
  endAt,
  startAt,
}: {
  endAt: Date;
  startAt: Date;
}) {
  return (
    <span dir="rtl">
      {formatJalaliDate(startAt)}، {formatDisplayTime(startAt)} تا{" "}
      {formatDisplayTime(endAt)}
    </span>
  );
}

function getAlternativeStatusClass(status: AlternativeStatus): string {
  if (status === "PROPOSED") {
    return "bg-sky-50 text-sky-800 ring-sky-200";
  }

  if (status === "ACCEPTED") {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }

  return "bg-muted text-muted-foreground ring-border";
}

function getAlternativeStatusLabel(status: AlternativeStatus): string {
  if (status === "PROPOSED") {
    return "پیشنهاد شده";
  }

  if (status === "ACCEPTED") {
    return "پذیرفته شده";
  }

  if (status === "REJECTED") {
    return "رد شده";
  }

  return "منقضی شده";
}

function ReservationsActionToast({
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
      <p className="min-w-0 flex-1 pl-8 leading-6">{toast.message}</p>
      <button
        aria-label="بستن پیام"
        className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onDismiss}
        type="button"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}

function ActionResultBridge<TState extends ActionStateBase>({
  onComplete,
  state,
}: {
  onComplete: (state: TState) => void;
  state: TState;
}) {
  useEffect(() => {
    if (state.status === "idle") {
      return;
    }

    onComplete(state);
  }, [onComplete, state]);

  return null;
}

function CancelLunchReservationPrompt({
  action,
  onClose,
  onComplete,
  prompt,
}: {
  action: (
    previousState: LunchActionState,
    formData: FormData,
  ) => Promise<LunchActionState>;
  onClose: () => void;
  onComplete: (state: LunchActionState) => void;
  prompt: LunchCancelPrompt;
}) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialLunchCancelState,
  );

  return (
    <div
      aria-labelledby="cancel-lunch-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      role="dialog"
    >
      <button
        aria-label="بستن پرسش لغو ناهار"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <div
        className="relative z-10 grid w-full max-w-md gap-4 rounded-t-lg border bg-background p-5 text-right shadow-lg sm:rounded-lg"
        dir="rtl"
      >
        <ActionResultBridge onComplete={onComplete} state={state} />
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <h3 className="font-medium" id="cancel-lunch-dialog-title">
              لغو ناهار
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              برای {prompt.dateLabel} ناهار هم رزرو کرده‌اید. ناهار هم لغو شود؟
            </p>
          </div>
          <button
            aria-label="بستن پرسش لغو ناهار"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="inline-flex h-11 w-full items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent sm:h-10 sm:w-auto"
            onClick={onClose}
            type="button"
          >
            نگه داشتن ناهار
          </button>
          <form action={formAction}>
            <input
              name="reservationId"
              type="hidden"
              value={prompt.reservationId}
            />
            <Button
              className="h-11 w-full sm:h-10 sm:w-auto"
              disabled={isPending}
              type="submit"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  در حال لغو...
                </>
              ) : (
                "لغو ناهار"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function AlternativeList({
  reservation,
}: {
  reservation: ActiveReservation;
}) {
  const shouldShowAlternatives =
    reservation.status === "ALTERNATIVE_PROPOSED" ||
    reservation.status === "REJECTED";

  if (!shouldShowAlternatives || reservation.alternatives.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        زمان پیشنهادی مدیر
      </p>
      <div className="grid gap-2">
        {reservation.alternatives.map((alternative) => {
          return (
            <div
              className="grid gap-2 rounded-md border bg-muted/30 p-2.5"
              key={alternative.id}
            >
              <div className="grid gap-1 text-sm">
                <div className="font-medium">
                  <ReservationTimeRange
                    endAt={alternative.proposedEndAt}
                    startAt={alternative.proposedStartAt}
                  />
                </div>
                <div>
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getAlternativeStatusClass(
                      alternative.status,
                    )}`}
                  >
                    {getAlternativeStatusLabel(alternative.status)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CancelReservationForm({
  onComplete,
  reservationStatus,
  reservationId,
}: {
  onComplete: (state: CancelReservationActionState) => void;
  reservationStatus: ReservationStatus;
  reservationId: string;
}) {
  const [state, formAction, isPending] = useActionState(
    cancelReservationByUserInlineAction,
    initialCancelState,
  );

  return (
    <form action={formAction}>
      <ActionResultBridge onComplete={onComplete} state={state} />
      <input name="reservationId" type="hidden" value={reservationId} />
      <Button
        className="h-8 px-2.5 text-xs"
        disabled={isPending}
        size="sm"
        type="submit"
        variant="outline"
      >
        {isPending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            در حال لغو...
          </>
        ) : (
          <>
            <X className="h-3.5 w-3.5" />
            {reservationStatus === "APPROVED" ? "لغو رزرو" : "لغو درخواست"}
          </>
        )}
      </Button>
    </form>
  );
}

function ReservationCard({
  onCancelComplete,
  reservation,
}: {
  onCancelComplete: (state: CancelReservationActionState) => void;
  reservation: ActiveReservation;
}) {
  const isPending = reservation.status === "PENDING";
  const canCancel = isPending || reservation.status === "APPROVED";
  const showReason = Boolean(reservation.reason?.trim());
  const hasShortReason = (reservation.reason?.trim().length ?? 0) <= 90;
  const showRejectionReason =
    reservation.status === "REJECTED" &&
    Boolean(reservation.rejectionReason?.trim());
  const showAlternatives =
    (reservation.status === "ALTERNATIVE_PROPOSED" ||
      reservation.status === "REJECTED") &&
    reservation.alternatives.length > 0;
  const showCardBody = showReason || showRejectionReason || showAlternatives;

  return (
    <article
      className={cn(
        "rounded-md border bg-card p-3 text-right text-card-foreground",
        isPending && "border-amber-200 bg-amber-50/40",
      )}
      dir="rtl"
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{reservation.resourcePool.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <ReservationTimeRange
              endAt={reservation.endAt}
              startAt={reservation.startAt}
            />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <span
            className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-medium ring-1 ${getStatusClass(
              reservation.status,
            )}`}
          >
            {getStatusLabel(reservation.status)}
          </span>

          {canCancel ? (
            <CancelReservationForm
              onComplete={onCancelComplete}
              reservationStatus={reservation.status}
              reservationId={reservation.id}
            />
          ) : null}
        </div>
      </div>

      {showCardBody ? (
        <div className="mt-2 grid gap-2">
          {showReason || showRejectionReason ? (
            <dl className="grid gap-1.5 text-xs">
              {showReason ? (
                <div
                  className={cn(
                    hasShortReason && "flex min-w-0 items-baseline gap-2",
                  )}
                >
                  <dt className="shrink-0 text-muted-foreground">دلیل درخواست</dt>
                  <dd
                    className={cn(
                      "leading-5",
                      hasShortReason ? "min-w-0 truncate" : "mt-1",
                    )}
                  >
                    {reservation.reason}
                  </dd>
                </div>
              ) : null}
              {showRejectionReason ? (
                <div>
                  <dt className="text-muted-foreground">دلیل رد</dt>
                  <dd className="mt-1 leading-5">
                    {reservation.rejectionReason}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          <AlternativeList reservation={reservation} />
        </div>
      ) : null}
    </article>
  );
}

export function ActiveReservationsList({
  activeLunchReservationByDate,
  cancelLunchReservationAction,
  onReservationCancelled,
  reservations,
}: ActiveReservationsListProps) {
  const [currentReservations, setCurrentReservations] = useState(reservations);
  const [currentLunchReservationByDate, setCurrentLunchReservationByDate] =
    useState(activeLunchReservationByDate);
  const [lunchCancelPrompt, setLunchCancelPrompt] =
    useState<LunchCancelPrompt | null>(null);
  const [toast, setToast] = useState<ActionToast | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    setCurrentReservations(reservations);
  }, [reservations]);

  useEffect(() => {
    setCurrentLunchReservationByDate(activeLunchReservationByDate);
  }, [activeLunchReservationByDate]);

  const handleCancelComplete = useCallback(
    (state: CancelReservationActionState) => {
      setToast({
        id: Date.now(),
        message: state.message,
        variant: state.status === "error" ? "error" : "success",
      });

      if (state.status === "success" && state.mutation?.type === "cancel") {
        const cancelledReservation = currentReservations.find(
          (reservation) => reservation.id === state.mutation?.reservationId,
        );

        if (cancelledReservation) {
          onReservationCancelled?.(cancelledReservation);

          const dateParam = formatJalaliDateParam(cancelledReservation.startAt);
          const lunchReservation = currentLunchReservationByDate[dateParam];

          if (lunchReservation) {
            setLunchCancelPrompt({
              dateLabel: formatJalaliDate(cancelledReservation.startAt),
              reservationId: lunchReservation.id,
            });
          }
        }

        setCurrentReservations((previousReservations) =>
          previousReservations.filter(
            (reservation) => reservation.id !== state.mutation?.reservationId,
          ),
        );
      }
    },
    [
      currentLunchReservationByDate,
      currentReservations,
      onReservationCancelled,
    ],
  );

  const handleLunchCancelComplete = useCallback(
    (state: LunchActionState) => {
      setToast({
        id: Date.now(),
        message: state.message,
        variant: state.status === "error" ? "error" : "success",
      });

      if (state.status === "success" && state.mutation?.type === "cancel") {
        const cancelledLunchReservationId = state.mutation.reservationId;

        setCurrentLunchReservationByDate((previousReservations) =>
          Object.fromEntries(
            Object.entries(previousReservations).filter(
              ([, reservation]) =>
                reservation.id !== cancelledLunchReservationId,
            ),
          ),
        );
        setLunchCancelPrompt(null);
      }
    },
    [],
  );

  return (
    <>
      <ReservationsActionToast onDismiss={dismissToast} toast={toast} />
      {lunchCancelPrompt ? (
        <CancelLunchReservationPrompt
          action={cancelLunchReservationAction}
          onClose={() => setLunchCancelPrompt(null)}
          onComplete={handleLunchCancelComplete}
          prompt={lunchCancelPrompt}
        />
      ) : null}
      {currentReservations.length === 0 ? (
        <div className="mt-5 rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">رزرو فعالی ندارید.</p>
          <p className="mt-1">
            برای ثبت درخواست جدید، یک بازه زمانی از تقویم انتخاب کنید.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-3">
          {currentReservations.map((reservation) => (
            <ReservationCard
              key={reservation.id}
              onCancelComplete={handleCancelComplete}
              reservation={reservation}
            />
          ))}
        </div>
      )}
    </>
  );
}
