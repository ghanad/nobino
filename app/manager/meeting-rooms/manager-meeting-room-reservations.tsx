"use client";

import { ReservationStatus } from "@prisma/client";
import {
  CalendarDays,
  Clock3,
  DoorOpen,
  NotebookText,
  UsersRound,
} from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ManagerMeetingRoomActionState } from "@/app/manager/meeting-rooms/actions";
import { Button } from "@/components/ui/button";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import {
  formatJalaliDate,
  formatJalaliDateParam,
  formatPersianLocalTime,
} from "@/lib/jalali-date";

const destructiveOutlineClass =
  "border-destructive/60 text-destructive hover:border-destructive hover:bg-destructive/5 hover:text-destructive";
const initialActionState: ManagerMeetingRoomActionState = {};
const noConsumedQueryKeys: string[] = [];

type Room = {
  id: string;
  name: string;
};

type Reservation = {
  room: { name: string };
  roomId: string;
  endAt: Date;
  id: string;
  startAt: Date;
  status: ReservationStatus;
  title: string | null;
  user: { email: string; name: string };
};

type ActionFormProps = Omit<ComponentPropsWithoutRef<"form">, "action"> & {
  action: (
    state: ManagerMeetingRoomActionState,
    formData: FormData,
  ) => Promise<ManagerMeetingRoomActionState>;
  children: ReactNode;
  confirmMessage?: string;
  onComplete: (state: ManagerMeetingRoomActionState) => void;
};

function ActionForm({
  action,
  children,
  confirmMessage,
  onComplete,
  ...props
}: ActionFormProps) {
  const [state, formAction] = useActionState(action, initialActionState);

  useEffect(() => {
    if (state.id) onComplete(state);
  }, [onComplete, state]);

  return (
    <form
      {...props}
      action={formAction}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
        props.onSubmit?.(event);
      }}
    >
      {children}
    </form>
  );
}

function StatusBadge({ status }: { status: ReservationStatus }) {
  if (status === ReservationStatus.PENDING) {
    return (
      <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        در انتظار تأیید
      </span>
    );
  }

  return (
    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
      تأییدشده
    </span>
  );
}

function SummaryBar({
  pending,
  today,
  future,
}: {
  pending: number;
  today: number;
  future: number;
}) {
  const items = [
    { label: "نیازمند بررسی", value: pending },
    { label: "رزرو امروز", value: today },
    { label: "رزروهای آینده", value: future },
  ];

  return (
    <div
      aria-label="خلاصه رزروها"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y bg-muted/30 px-3 py-2.5 text-sm"
    >
      {items.map((item, index) => (
        <div className="flex items-baseline gap-1.5" key={item.label}>
          <bdi className="font-semibold tabular-nums text-slate-950" dir="ltr">
            {item.value}
          </bdi>
          <span
            className={
              index === 0 && pending > 0
                ? "font-medium text-amber-800"
                : "text-muted-foreground"
            }
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

type FilterStatus = "all" | "pending" | "approved";

function FilterBar({
  rooms,
  filterStatus,
  selectedRoomId,
  selectedDate,
  setFilterStatus,
  setSelectedRoomId,
  setSelectedDate,
  todayParam,
}: {
  rooms: Room[];
  filterStatus: FilterStatus;
  selectedRoomId: string;
  selectedDate: string;
  setFilterStatus: (status: FilterStatus) => void;
  setSelectedRoomId: (id: string) => void;
  setSelectedDate: (date: string) => void;
  todayParam: string;
}) {
  const hasFilters = filterStatus !== "all" || !!selectedDate || !!selectedRoomId;

  return (
    <section
      aria-label="فیلتر رزروها"
      className="grid gap-3 rounded-lg border bg-card p-3 sm:p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid gap-0.5">
          <h2 className="text-sm font-medium text-slate-950">فیلتر و نمایش</h2>
          <p className="text-xs text-muted-foreground">
            درخواست‌ها را بر اساس وضعیت، تاریخ یا اتاق محدود کنید.
          </p>
        </div>
        {hasFilters ? (
          <Button
            onClick={() => {
              setFilterStatus("all");
              setSelectedDate("");
              setSelectedRoomId("");
            }}
            size="sm"
            variant="ghost"
          >
            پاک کردن فیلترها
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 border-t pt-3 lg:flex-row lg:items-center">
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="وضعیت رزرو"
        >
          <Button
            onClick={() => setFilterStatus("all")}
            size="sm"
            variant={filterStatus === "all" ? "default" : "outline"}
          >
            همه
          </Button>
          <Button
            onClick={() => setFilterStatus("pending")}
            size="sm"
            variant={filterStatus === "pending" ? "default" : "outline"}
          >
            در انتظار تأیید
          </Button>
          <Button
            onClick={() => setFilterStatus("approved")}
            size="sm"
            variant={filterStatus === "approved" ? "default" : "outline"}
          >
            تأییدشده
          </Button>
        </div>
        <div className="hidden h-7 w-px bg-border lg:block" />
        <div className="flex flex-wrap items-center gap-2">
          <label
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
            htmlFor="filter-date"
          >
            <CalendarDays className="size-3.5" aria-hidden="true" />
            تاریخ
          </label>
          <JalaliDatePicker
            containerClassName="w-28 sm:w-32"
            id="filter-date"
            inputClassName="h-8"
            name="filterDate"
            onValueChange={setSelectedDate}
            value={selectedDate || undefined}
          />
          <Button
            onClick={() => setSelectedDate(todayParam)}
            size="sm"
            variant="ghost"
          >
            امروز
          </Button>
          {selectedDate ? (
            <Button
              onClick={() => setSelectedDate("")}
              size="sm"
              variant="ghost"
            >
              پاک
            </Button>
          ) : null}
        </div>
        <div className="hidden h-7 w-px bg-border lg:block" />
        <div className="flex flex-wrap items-center gap-2">
          <label
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
            htmlFor="filter-room"
          >
            <DoorOpen className="size-3.5" aria-hidden="true" />
            اتاق
          </label>
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs sm:text-sm"
            id="filter-room"
            onChange={(event) => setSelectedRoomId(event.target.value)}
            value={selectedRoomId}
          >
            <option value="">همه</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}

function RejectForm({
  action,
  onCancel,
  onComplete,
  reservationId,
}: {
  action: ActionFormProps["action"];
  onCancel: () => void;
  onComplete: (state: ManagerMeetingRoomActionState) => void;
  reservationId: string;
}) {
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    formRef.current?.focus();
  }, []);

  return (
    <div
      className="mt-3 max-w-2xl rounded-md border bg-muted p-3"
      ref={formRef}
      tabIndex={-1}
    >
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">
        رد درخواست
      </h3>
      <ActionForm
        action={action}
        className="grid gap-3"
        onComplete={onComplete}
      >
        <input name="reservationId" type="hidden" value={reservationId} />
        <div className="grid gap-1">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor={`reject-reason-${reservationId}`}
          >
            دلیل رد (اختیاری)
          </label>
          <input
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            id={`reject-reason-${reservationId}`}
            maxLength={500}
            name="rejectionReason"
            placeholder="برای درخواست‌دهنده نمایش داده می‌شود"
            type="text"
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
          <SubmitButton
            className={destructiveOutlineClass}
            pendingLabel="در حال رد"
            variant="outline"
          >
            ثبت رد
          </SubmitButton>
          <Button onClick={onCancel} type="button" variant="ghost">
            انصراف
          </Button>
        </div>
      </ActionForm>
    </div>
  );
}

function ReservationItem({
  actions,
  isRejecting,
  onComplete,
  onToggleReject,
  reservation,
}: {
  actions: {
    approve: ActionFormProps["action"];
    cancel: ActionFormProps["action"];
    reject: ActionFormProps["action"];
  };
  isRejecting: boolean;
  onComplete: (state: ManagerMeetingRoomActionState) => void;
  onToggleReject: () => void;
  reservation: Reservation;
}) {
  const rejectFormId = useId();
  const isPending = reservation.status === ReservationStatus.PENDING;

  const timeRange = (
    <>
      <bdi dir="ltr">{formatPersianLocalTime(reservation.startAt)}</bdi>
      {" تا "}
      <bdi dir="ltr">{formatPersianLocalTime(reservation.endAt)}</bdi>
    </>
  );

  const rejectButton = (fullWidth = false) => (
    <Button
      aria-controls={rejectFormId}
      aria-expanded={isRejecting}
      className={`${destructiveOutlineClass}${fullWidth ? " w-full" : ""}`}
      onClick={onToggleReject}
      type="button"
      variant="outline"
    >
      رد درخواست
    </Button>
  );

  const cancelButton = (
    <ActionForm
      action={actions.cancel}
      confirmMessage="آیا از لغو این رزرو اطمینان دارید؟"
      onComplete={onComplete}
    >
      <input name="reservationId" type="hidden" value={reservation.id} />
      <SubmitButton
        className={destructiveOutlineClass}
        pendingLabel="در حال لغو"
        variant="outline"
      >
        لغو رزرو
      </SubmitButton>
    </ActionForm>
  );

  return (
    <article
      className={`rounded-lg border bg-card p-4 transition-colors ${isPending ? "border-amber-200/90" : ""}`}
    >
      {/* Desktop layout */}
      <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-950">
              {reservation.user.name}
            </span>
            <StatusBadge status={reservation.status} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <DoorOpen className="size-3.5" aria-hidden="true" />
              {reservation.room.name}
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-700">
              <Clock3 className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {formatJalaliDate(reservation.startAt)} · {timeRange}
            </span>
          </div>
          {reservation.title ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <NotebookText className="size-3.5" aria-hidden="true" />
              {reservation.title}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{reservation.user.email}</p>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-2">
          {isPending ? (
            <>
              <ActionForm action={actions.approve} onComplete={onComplete}>
                <input
                  name="reservationId"
                  type="hidden"
                  value={reservation.id}
                />
                <SubmitButton pendingLabel="در حال تأیید">
                  تأیید درخواست
                </SubmitButton>
              </ActionForm>
              {rejectButton()}
            </>
          ) : (
            cancelButton
          )}
        </div>
      </div>

      {/* Mobile layout */}
      <div className="sm:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-950">
              <UsersRound className="size-4 text-muted-foreground" aria-hidden="true" />
              {reservation.user.name}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <DoorOpen className="size-3.5" aria-hidden="true" />
              {reservation.room.name}
            </span>
          </div>
          <StatusBadge status={reservation.status} />
        </div>
        <p className="mt-2 text-sm text-slate-700">
          {formatJalaliDate(reservation.startAt)} · {timeRange}
        </p>
        {reservation.title ? (
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <NotebookText className="size-3.5" aria-hidden="true" />
            {reservation.title}
          </p>
        ) : null}
        <div className="mt-3 grid gap-2">
          {isPending ? (
            <>
              <ActionForm
                action={actions.approve}
                className="w-full"
                onComplete={onComplete}
              >
                <input
                  name="reservationId"
                  type="hidden"
                  value={reservation.id}
                />
                <SubmitButton
                  className="w-full"
                  pendingLabel="در حال تأیید"
                >
                  تأیید درخواست
                </SubmitButton>
              </ActionForm>
              <div className="w-full">{rejectButton(true)}</div>
            </>
          ) : (
            <ActionForm
              action={actions.cancel}
              className="w-full"
              confirmMessage="آیا از لغو این رزرو اطمینان دارید؟"
              onComplete={onComplete}
            >
              <input name="reservationId" type="hidden" value={reservation.id} />
              <SubmitButton
                className={destructiveOutlineClass}
                pendingLabel="در حال لغو"
                variant="outline"
              >
                لغو رزرو
              </SubmitButton>
            </ActionForm>
          )}
        </div>
      </div>

      {isRejecting ? (
        <div id={rejectFormId}>
          <RejectForm
            action={actions.reject}
            onCancel={onToggleReject}
            onComplete={onComplete}
            reservationId={reservation.id}
          />
        </div>
      ) : null}
    </article>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-md border bg-card p-4 text-center">
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? "رزروی با این فیلترها یافت نشد."
          : "درخواست یا رزرو فعال اتاق جلسه وجود ندارد."}
      </p>
    </div>
  );
}

type Props = {
  actions: {
    approve: ActionFormProps["action"];
    cancel: ActionFormProps["action"];
    reject: ActionFormProps["action"];
  };
  initialReservations: Reservation[];
  rooms: Room[];
};

export function ManagerMeetingRoomReservations({
  actions,
  initialReservations,
  rooms,
}: Props) {
  const [reservations, setReservations] = useState(initialReservations);
  const [feedback, setFeedback] = useState<ManagerMeetingRoomActionState | null>(
    null,
  );
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const todayParam = useMemo(() => formatJalaliDateParam(new Date()), []);

  const filteredReservations = useMemo(() => {
    return reservations
      .filter((reservation) => {
        if (filterStatus === "pending") {
          return reservation.status === ReservationStatus.PENDING;
        }

        if (filterStatus === "approved") {
          return reservation.status === ReservationStatus.APPROVED;
        }

        return true;
      })
      .filter((reservation) => {
        if (!selectedDate) return true;

        return formatJalaliDateParam(reservation.startAt) === selectedDate;
      })
      .filter((reservation) => {
        if (!selectedRoomId) return true;

        return reservation.roomId === selectedRoomId;
      })
      .sort((first, second) => {
        const statusDifference =
          Number(first.status !== ReservationStatus.PENDING) -
          Number(second.status !== ReservationStatus.PENDING);

        return (
          statusDifference || first.startAt.getTime() - second.startAt.getTime()
        );
      });
  }, [reservations, filterStatus, selectedDate, selectedRoomId]);

  const pendingReservations = useMemo(
    () =>
      filteredReservations.filter(
        (reservation) => reservation.status === ReservationStatus.PENDING,
      ),
    [filteredReservations],
  );

  const approvedReservations = useMemo(
    () =>
      filteredReservations.filter(
        (reservation) => reservation.status === ReservationStatus.APPROVED,
      ),
    [filteredReservations],
  );

  const pendingCount = useMemo(
    () =>
      reservations.filter(
        (reservation) => reservation.status === ReservationStatus.PENDING,
      ).length,
    [reservations],
  );

  const todayCount = useMemo(
    () =>
      reservations.filter(
        (reservation) =>
          formatJalaliDateParam(reservation.startAt) === todayParam,
      ).length,
    [reservations, todayParam],
  );

  const futureCount = useMemo(
    () =>
      reservations.filter(
        (reservation) =>
          formatJalaliDateParam(reservation.startAt) > todayParam,
      ).length,
    [reservations, todayParam],
  );

  const handleComplete = useCallback((state: ManagerMeetingRoomActionState) => {
    setFeedback(state);
    if (!state.ok || !state.mutation) return;

    const mutation = state.mutation;
    if (mutation.type === "remove") {
      setReservations((items) =>
        items.filter((item) => item.id !== mutation.reservationId),
      );
      setRejectingId(null);
      return;
    }

    if (mutation.type === "approve") {
      setReservations((items) =>
        items.map((item) =>
          item.id === mutation.reservationId
            ? { ...item, status: ReservationStatus.APPROVED }
            : item,
        ),
      );
      setRejectingId(null);
    }
  }, []);

  const handleToggleReject = useCallback((id: string) => {
    setRejectingId((current) => (current === id ? null : id));
  }, []);

  const hasFilters =
    filterStatus !== "all" || !!selectedDate || !!selectedRoomId;

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
      <div className="grid gap-4">
        <SummaryBar
          future={futureCount}
          pending={pendingCount}
          today={todayCount}
        />
        <FilterBar
          rooms={rooms}
          filterStatus={filterStatus}
          selectedRoomId={selectedRoomId}
          selectedDate={selectedDate}
          setFilterStatus={setFilterStatus}
          setSelectedRoomId={setSelectedRoomId}
          setSelectedDate={setSelectedDate}
          todayParam={todayParam}
        />
        <div className="grid gap-5">
          {filterStatus !== "approved" && pendingReservations.length > 0 ? (
            <section className="grid gap-3">
              <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
                نیازمند بررسی
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                  {pendingReservations.length}
                </span>
              </h2>
              <div className="grid gap-3">
                {pendingReservations.map((reservation) => (
                  <ReservationItem
                    actions={actions}
                    isRejecting={rejectingId === reservation.id}
                    key={reservation.id}
                    onComplete={handleComplete}
                    onToggleReject={() => handleToggleReject(reservation.id)}
                    reservation={reservation}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {filterStatus !== "pending" && approvedReservations.length > 0 ? (
            <section className="grid gap-3">
              <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
                رزروهای تأییدشده
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                  {approvedReservations.length}
                </span>
              </h2>
              <div className="grid gap-3">
                {approvedReservations.map((reservation) => (
                  <ReservationItem
                    actions={actions}
                    isRejecting={rejectingId === reservation.id}
                    key={reservation.id}
                    onComplete={handleComplete}
                    onToggleReject={() => handleToggleReject(reservation.id)}
                    reservation={reservation}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {filteredReservations.length === 0 ? (
            <EmptyState hasFilters={hasFilters} />
          ) : null}
        </div>
      </div>
    </>
  );
}
