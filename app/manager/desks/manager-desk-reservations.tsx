"use client";

import { ReservationStatus } from "@prisma/client";
import { Building2, CalendarDays, Clock3, UsersRound } from "lucide-react";
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

import type { ManagerDeskActionState } from "@/app/manager/desks/actions";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { Button } from "@/components/ui/button";
import {
  formatJalaliDate,
  formatJalaliDateParam,
  formatPersianLocalTime,
} from "@/lib/jalali-date";

const destructiveOutlineClass =
  "border-destructive/60 text-destructive hover:border-destructive hover:bg-destructive/5 hover:text-destructive";
const initialActionState: ManagerDeskActionState = {};
const noConsumedQueryKeys: string[] = [];

type Building = {
  desks: { id: string; name: string }[];
  id: string;
  name: string;
};

type Reservation = {
  desk: { name: string; building: { name: string } };
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
  confirmMessage?: string;
  onComplete: (state: ManagerDeskActionState) => void;
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
          <span className={index === 0 && pending > 0 ? "font-medium text-amber-800" : "text-muted-foreground"}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

type FilterStatus = "all" | "pending" | "approved";

function FilterBar({
  buildings,
  filterStatus,
  selectedBuildingId,
  selectedDate,
  setFilterStatus,
  setSelectedBuildingId,
  setSelectedDate,
  todayParam,
}: {
  buildings: Building[];
  filterStatus: FilterStatus;
  selectedBuildingId: string;
  selectedDate: string;
  setFilterStatus: (status: FilterStatus) => void;
  setSelectedBuildingId: (id: string) => void;
  setSelectedDate: (date: string) => void;
  todayParam: string;
}) {
  const hasFilters =
    filterStatus !== "all" || !!selectedDate || !!selectedBuildingId;

  return (
    <section aria-label="فیلتر رزروها" className="grid gap-3 rounded-lg border bg-card p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid gap-0.5">
          <h2 className="text-sm font-medium text-slate-950">فیلتر و نمایش</h2>
          <p className="text-xs text-muted-foreground">درخواست‌ها را بر اساس وضعیت، تاریخ یا ساختمان محدود کنید.</p>
        </div>
        {hasFilters ? (
          <Button
            onClick={() => {
              setFilterStatus("all");
              setSelectedDate("");
              setSelectedBuildingId("");
            }}
            size="sm"
            variant="ghost"
          >
            پاک کردن فیلترها
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 border-t pt-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="وضعیت رزرو">
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
          <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground" htmlFor="filter-date">
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
          <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground" htmlFor="filter-building">
            <Building2 className="size-3.5" aria-hidden="true" />
          ساختمان
        </label>
        <select
          className="h-8 rounded-md border bg-background px-2 text-xs sm:text-sm"
          id="filter-building"
          onChange={(event) => setSelectedBuildingId(event.target.value)}
          value={selectedBuildingId}
        >
          <option value="">همه</option>
          {buildings.map((building) => (
            <option key={building.id} value={building.id}>
              {building.name}
            </option>
          ))}
        </select>
      </div>
      </div>
    </section>
  );
}

function EditForm({
  action,
  buildings,
  deskById,
  onCancel,
  onComplete,
  reservation,
}: {
  action: ActionFormProps["action"];
  buildings: Building[];
  deskById: Map<string, { building: Building; id: string; name: string }>;
  onCancel: () => void;
  onComplete: (state: ManagerDeskActionState) => void;
  reservation: Reservation;
}) {
  const hasStarted = reservation.startAt <= new Date();
  const currentDesk = deskById.get(reservation.deskId);
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
        تغییر رزرو
      </h3>
      <ActionForm
        action={action}
        className="grid gap-3"
        onComplete={onComplete}
      >
        <input name="reservationId" type="hidden" value={reservation.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor={`edit-date-${reservation.id}`}
            >
              تاریخ
            </label>
            <JalaliDatePicker
              disabled={hasStarted}
              id={`edit-date-${reservation.id}`}
              inputClassName="h-9"
              name="date"
              required
              value={formatJalaliDateParam(reservation.startAt)}
            />
            {hasStarted ? (
              <input
                name="date"
                type="hidden"
                value={formatJalaliDateParam(reservation.startAt)}
              />
            ) : null}
          </div>
          <div className="grid gap-1">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor={`edit-desk-${reservation.id}`}
            >
              میز
            </label>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              defaultValue={reservation.deskId}
              disabled={hasStarted}
              id={`edit-desk-${reservation.id}`}
              key={reservation.deskId}
              name="deskId"
            >
              {buildings.map((building) => (
                <optgroup key={building.id} label={building.name}>
                  {building.desks.map((desk) => (
                    <option key={desk.id} value={desk.id}>
                      {desk.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {hasStarted ? (
              <input
                name="deskId"
                type="hidden"
                value={reservation.deskId}
              />
            ) : null}
          </div>
          <div className="grid gap-1">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor={`edit-start-${reservation.id}`}
            >
              از ساعت
            </label>
            <input
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              defaultValue={reservation.startAt.getHours()}
              id={`edit-start-${reservation.id}`}
              key={`start-${reservation.startAt.toISOString()}`}
              max={23}
              min={0}
              name="startHour"
              readOnly={hasStarted}
              type="number"
            />
          </div>
          <div className="grid gap-1">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor={`edit-end-${reservation.id}`}
            >
              تا ساعت
            </label>
            <input
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              defaultValue={reservation.endAt.getHours()}
              id={`edit-end-${reservation.id}`}
              key={`end-${reservation.endAt.toISOString()}`}
              max={24}
              min={1}
              name="endHour"
              type="number"
            />
          </div>
        </div>
        {currentDesk && hasStarted ? (
          <p className="text-xs text-muted-foreground">
            رزرو آغاز شده؛ تاریخ، ساختمان و میز و ساعت شروع قابل تغییر نیستند.
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
          <SubmitButton pendingLabel="در حال ذخیره">
            ذخیره تغییرات
          </SubmitButton>
          <Button
            onClick={onCancel}
            type="button"
            variant="outline"
          >
            انصراف
          </Button>
        </div>
      </ActionForm>
    </div>
  );
}

function ReservationItem({
  actions,
  buildings,
  deskById,
  isEditing,
  onComplete,
  onToggleEdit,
  reservation,
}: {
  actions: {
    approve: ActionFormProps["action"];
    cancel: ActionFormProps["action"];
    reject: ActionFormProps["action"];
    update: ActionFormProps["action"];
  };
  buildings: Building[];
  deskById: Map<string, { building: Building; id: string; name: string }>;
  isEditing: boolean;
  onComplete: (state: ManagerDeskActionState) => void;
  onToggleEdit: () => void;
  reservation: Reservation;
}) {
  const editFormId = useId();
  const isPending = reservation.status === ReservationStatus.PENDING;

  const timeRange = (
    <>
      <bdi dir="ltr">{formatPersianLocalTime(reservation.startAt)}</bdi>
      {" تا "}
      <bdi dir="ltr">{formatPersianLocalTime(reservation.endAt)}</bdi>
    </>
  );

  return (
    <article className={`rounded-lg border bg-card p-4 transition-colors ${isPending ? "border-amber-200/90" : ""}`}>
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
              <Building2 className="size-3.5" aria-hidden="true" />
              {reservation.desk.building.name} · {reservation.desk.name}
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-700">
              <Clock3 className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {formatJalaliDate(reservation.startAt)} · {timeRange}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {reservation.user.email}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-2">
          {isPending ? (
            <>
              <ActionForm
                action={actions.approve}
                onComplete={onComplete}
              >
                <input
                  name="reservationId"
                  type="hidden"
                  value={reservation.id}
                />
                <SubmitButton pendingLabel="در حال تأیید">
                  تأیید درخواست
                </SubmitButton>
              </ActionForm>
              {!isEditing ? (
                <Button
                  aria-controls={editFormId}
                  aria-expanded={isEditing}
                  onClick={onToggleEdit}
                  type="button"
                  variant="outline"
                >
                  ویرایش
                </Button>
              ) : null}
              <ActionForm
                action={actions.reject}
                confirmMessage="آیا از رد این درخواست اطمینان دارید؟"
                onComplete={onComplete}
              >
                <input
                  name="reservationId"
                  type="hidden"
                  value={reservation.id}
                />
                <SubmitButton
                  className={destructiveOutlineClass}
                  pendingLabel="در حال رد"
                  variant="outline"
                >
                  رد درخواست
                </SubmitButton>
              </ActionForm>
            </>
          ) : (
            <>
              {!isEditing ? (
                <Button
                  aria-controls={editFormId}
                  aria-expanded={isEditing}
                  onClick={onToggleEdit}
                  type="button"
                  variant="outline"
                >
                  ویرایش
                </Button>
              ) : null}
              <ActionForm
                action={actions.cancel}
                confirmMessage="آیا از لغو این رزرو اطمینان دارید؟"
                onComplete={onComplete}
              >
                <input
                  name="reservationId"
                  type="hidden"
                  value={reservation.id}
                />
                <SubmitButton
                  className={destructiveOutlineClass}
                  pendingLabel="در حال لغو"
                  variant="outline"
                >
                  لغو رزرو
                </SubmitButton>
              </ActionForm>
            </>
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
            <span className="text-sm text-muted-foreground">
              {reservation.desk.building.name} · {reservation.desk.name}
            </span>
          </div>
          <StatusBadge status={reservation.status} />
        </div>
        <p className="mt-2 text-sm text-slate-700">
          {formatJalaliDate(reservation.startAt)} · {timeRange}
        </p>
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
              {!isEditing ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    aria-controls={editFormId}
                    aria-expanded={isEditing}
                    className="w-full"
                    onClick={onToggleEdit}
                    type="button"
                    variant="outline"
                  >
                    ویرایش
                  </Button>
                  <ActionForm
                    action={actions.reject}
                    className="w-full"
                    confirmMessage="آیا از رد این درخواست اطمینان دارید؟"
                    onComplete={onComplete}
                  >
                    <input
                      name="reservationId"
                      type="hidden"
                      value={reservation.id}
                    />
                    <SubmitButton
                      className={destructiveOutlineClass}
                      pendingLabel="در حال رد"
                      variant="outline"
                    >
                      رد درخواست
                    </SubmitButton>
                  </ActionForm>
                </div>
              ) : null}
            </>
          ) : (
            <>
              {!isEditing ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    aria-controls={editFormId}
                    aria-expanded={isEditing}
                    className="w-full"
                    onClick={onToggleEdit}
                    type="button"
                    variant="outline"
                  >
                    ویرایش
                  </Button>
                  <ActionForm
                    action={actions.cancel}
                    className="w-full"
                    confirmMessage="آیا از لغو این رزرو اطمینان دارید؟"
                    onComplete={onComplete}
                  >
                    <input
                      name="reservationId"
                      type="hidden"
                      value={reservation.id}
                    />
                    <SubmitButton
                      className={destructiveOutlineClass}
                      pendingLabel="در حال لغو"
                      variant="outline"
                    >
                      لغو رزرو
                    </SubmitButton>
                  </ActionForm>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <div id={editFormId}>
          <EditForm
            action={actions.update}
            buildings={buildings}
            deskById={deskById}
            onCancel={onToggleEdit}
            onComplete={onComplete}
            reservation={reservation}
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
          : "رزرو فعال یا آینده‌ای وجود ندارد."}
      </p>
    </div>
  );
}

type Props = {
  actions: {
    approve: ActionFormProps["action"];
    cancel: ActionFormProps["action"];
    reject: ActionFormProps["action"];
    update: ActionFormProps["action"];
  };
  initialReservations: Reservation[];
  buildings: Building[];
};

export function ManagerDeskReservations({
  actions,
  initialReservations,
  buildings,
}: Props) {
  const [reservations, setReservations] = useState(initialReservations);
  const [feedback, setFeedback] = useState<ManagerDeskActionState | null>(
    null,
  );
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const todayParam = useMemo(() => formatJalaliDateParam(new Date()), []);

  const deskById = useMemo(() => {
    const map = new Map<
      string,
      { building: Building; id: string; name: string }
    >();

    for (const building of buildings) {
      for (const desk of building.desks) {
        map.set(desk.id, { ...desk, building });
      }
    }

    return map;
  }, [buildings]);

  const buildingByDeskId = useMemo(() => {
    const map = new Map<string, Building>();

    for (const building of buildings) {
      for (const desk of building.desks) {
        map.set(desk.id, building);
      }
    }

    return map;
  }, [buildings]);

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
        if (!selectedBuildingId) return true;

        const building = buildingByDeskId.get(reservation.deskId);
        return building?.id === selectedBuildingId;
      })
      .sort((first, second) => {
        const statusDifference =
          Number(first.status !== ReservationStatus.PENDING) -
          Number(second.status !== ReservationStatus.PENDING);

        return statusDifference || first.startAt.getTime() - second.startAt.getTime();
      });
  }, [
    reservations,
    filterStatus,
    selectedDate,
    selectedBuildingId,
    buildingByDeskId,
  ]);

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

  const handleComplete = useCallback(
    (state: ManagerDeskActionState) => {
      setFeedback(state);
      if (!state.ok || !state.mutation) return;

      const mutation = state.mutation;
      if (mutation.type === "remove") {
        setReservations((items) =>
          items.filter((item) => item.id !== mutation.reservationId),
        );
        setEditingId(null);
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
        setEditingId(null);
        return;
      }

      const building = buildings.find((item) =>
        item.desks.some((desk) => desk.id === mutation.deskId),
      );
      const desk = building?.desks.find((item) => item.id === mutation.deskId);
      if (!building || !desk || !mutation.startAt || !mutation.endAt || !mutation.deskId) {
        return;
      }

      const deskId = mutation.deskId;
      const endAt = new Date(mutation.endAt);
      const startAt = new Date(mutation.startAt);
      setReservations((items) =>
        items.map((item) =>
          item.id === mutation.reservationId
            ? {
                ...item,
                desk: { name: desk.name, building: { name: building.name } },
                deskId,
                endAt,
                startAt,
              }
            : item,
        ),
      );
      setEditingId(null);
    },
    [buildings],
  );

  const handleToggleEdit = useCallback((id: string) => {
    setEditingId((current) => (current === id ? null : id));
  }, []);

  const hasFilters =
    filterStatus !== "all" || !!selectedDate || !!selectedBuildingId;

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
          buildings={buildings}
          filterStatus={filterStatus}
          selectedBuildingId={selectedBuildingId}
          selectedDate={selectedDate}
          setFilterStatus={setFilterStatus}
          setSelectedBuildingId={setSelectedBuildingId}
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
                    buildings={buildings}
                    deskById={deskById}
                    isEditing={editingId === reservation.id}
                    key={reservation.id}
                    onComplete={handleComplete}
                    onToggleEdit={() => handleToggleEdit(reservation.id)}
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
                    buildings={buildings}
                    deskById={deskById}
                    isEditing={editingId === reservation.id}
                    key={reservation.id}
                    onComplete={handleComplete}
                    onToggleEdit={() => handleToggleEdit(reservation.id)}
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
