"use client";

import { ReservationStatus } from "@prisma/client";
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useActionState,
  useCallback,
  useEffect,
  useState,
} from "react";

import type { ManagerDeskActionState } from "@/app/manager/desks/actions";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { formatJalaliDate, formatJalaliDateParam, formatPersianLocalTime } from "@/lib/jalali-date";

const inputClass = "h-10 rounded-md border bg-background px-3 text-sm";
const initialActionState: ManagerDeskActionState = {};
const noConsumedQueryKeys: string[] = [];

type Office = {
  desks: { id: string; name: string }[];
  id: string;
  name: string;
};

type Reservation = {
  desk: { name: string; office: { name: string } };
  deskId: string;
  endAt: Date;
  id: string;
  startAt: Date;
  status: ReservationStatus;
  user: { email: string; name: string };
};

type ActionFormProps = Omit<ComponentPropsWithoutRef<"form">, "action"> & {
  action: (
    state: ManagerDeskActionState,
    formData: FormData,
  ) => Promise<ManagerDeskActionState>;
  children: ReactNode;
  onComplete: (state: ManagerDeskActionState) => void;
};

function ActionForm({ action, children, onComplete, ...props }: ActionFormProps) {
  const [state, formAction] = useActionState(action, initialActionState);

  useEffect(() => {
    if (state.id) onComplete(state);
  }, [onComplete, state]);

  return <form {...props} action={formAction}>{children}</form>;
}

type Props = {
  actions: {
    approve: ActionFormProps["action"];
    cancel: ActionFormProps["action"];
    reject: ActionFormProps["action"];
    update: ActionFormProps["action"];
  };
  initialReservations: Reservation[];
  offices: Office[];
};

export function ManagerDeskReservations({ actions, initialReservations, offices }: Props) {
  const [reservations, setReservations] = useState(initialReservations);
  const [feedback, setFeedback] = useState<ManagerDeskActionState | null>(null);

  const handleComplete = useCallback((state: ManagerDeskActionState) => {
    setFeedback(state);
    if (!state.ok || !state.mutation) return;

    const mutation = state.mutation;
    if (mutation.type === "remove") {
      setReservations((items) => items.filter((item) => item.id !== mutation.reservationId));
      return;
    }
    if (mutation.type === "approve") {
      setReservations((items) => items.map((item) =>
        item.id === mutation.reservationId
          ? { ...item, status: ReservationStatus.APPROVED }
          : item
      ));
      return;
    }

    const office = offices.find((item) =>
      item.desks.some((desk) => desk.id === mutation.deskId)
    );
    const desk = office?.desks.find((item) => item.id === mutation.deskId);
    if (!office || !desk || !mutation.startAt || !mutation.endAt || !mutation.deskId) return;
    const deskId = mutation.deskId;
    const endAt = new Date(mutation.endAt);
    const startAt = new Date(mutation.startAt);
    setReservations((items) => items.map((item) =>
      item.id === mutation.reservationId
        ? {
            ...item,
            desk: { name: desk.name, office: { name: office.name } },
            deskId,
            endAt,
            startAt,
          }
        : item
    ));
  }, [offices]);

  return (
    <>
      {feedback?.message ? (
        <UrlToast
          consumeKeys={noConsumedQueryKeys}
          key={feedback.id}
          message={feedback.message}
          variant={feedback.ok ? "success" : "error"}
        />
      ) : null}
      <section className="grid gap-4">
        {reservations.length === 0 ? (
          <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
            رزرو فعال یا آینده‌ای وجود ندارد.
          </p>
        ) : reservations.map((reservation) => {
          const hasStarted = reservation.startAt <= new Date();
          return (
            <article className="grid gap-4 rounded-lg border bg-card p-5" key={reservation.id}>
              <div className="text-sm leading-7">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{reservation.user.name}</strong>
                  <span className={reservation.status === ReservationStatus.PENDING ? "rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700" : "rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"}>
                    {reservation.status === ReservationStatus.PENDING ? "در انتظار تأیید" : "تأییدشده"}
                  </span>
                </div>
                ({reservation.user.email}) — {reservation.desk.office.name}، {reservation.desk.name}
                <br />
                {formatJalaliDate(reservation.startAt)}، {formatPersianLocalTime(reservation.startAt)} تا {formatPersianLocalTime(reservation.endAt)}
              </div>
              <ActionForm action={actions.update} className="grid gap-3 md:grid-cols-5" onComplete={handleComplete}>
                <input name="reservationId" type="hidden" value={reservation.id} />
                <JalaliDatePicker disabled={hasStarted} name="date" required value={formatJalaliDateParam(reservation.startAt)} />
                {hasStarted ? <input name="date" type="hidden" value={formatJalaliDateParam(reservation.startAt)} /> : null}
                <select className={inputClass} defaultValue={reservation.deskId} disabled={hasStarted} key={reservation.deskId} name="deskId">
                  {offices.map((office) => <optgroup key={office.id} label={office.name}>{office.desks.map((desk) => <option key={desk.id} value={desk.id}>{desk.name}</option>)}</optgroup>)}
                </select>
                {hasStarted ? <input name="deskId" type="hidden" value={reservation.deskId} /> : null}
                <input className={inputClass} defaultValue={reservation.startAt.getHours()} key={`start-${reservation.startAt.toISOString()}`} max={23} min={0} name="startHour" readOnly={hasStarted} type="number" />
                <input className={inputClass} defaultValue={reservation.endAt.getHours()} key={`end-${reservation.endAt.toISOString()}`} max={24} min={1} name="endHour" type="number" />
                <SubmitButton pendingLabel="در حال ذخیره">ذخیره</SubmitButton>
              </ActionForm>
              <div className="flex flex-wrap gap-2">
                {reservation.status === ReservationStatus.PENDING ? (
                  <>
                    <ActionForm action={actions.approve} onComplete={handleComplete}>
                      <input name="reservationId" type="hidden" value={reservation.id} />
                      <SubmitButton pendingLabel="در حال تأیید">تأیید درخواست</SubmitButton>
                    </ActionForm>
                    <ActionForm action={actions.reject} onComplete={handleComplete}>
                      <input name="reservationId" type="hidden" value={reservation.id} />
                      <SubmitButton pendingLabel="در حال رد" variant="outline">رد درخواست</SubmitButton>
                    </ActionForm>
                  </>
                ) : null}
                <ActionForm action={actions.cancel} onComplete={handleComplete}>
                  <input name="reservationId" type="hidden" value={reservation.id} />
                  <SubmitButton pendingLabel="در حال لغو" variant="outline">لغو رزرو</SubmitButton>
                </ActionForm>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
