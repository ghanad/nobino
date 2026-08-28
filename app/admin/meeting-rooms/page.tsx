import { UserRole } from "@prisma/client";
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  Plus,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  createMeetingRoomAction,
  createMeetingRoomScheduleExceptionAction,
  deleteMeetingRoomAction,
  deleteMeetingRoomScheduleExceptionAction,
  updateMeetingRoomAction,
  updateMeetingRoomScheduleExceptionAction,
  updateMeetingRoomWeeklyScheduleAction,
} from "@/app/admin/meeting-rooms/actions";
import { SpacesReservationSectionShell } from "@/app/admin/_components/spaces-reservation-section";
import { MeetingRoomPicker } from "@/app/admin/meeting-rooms/meeting-room-picker";
import { JalaliDatePicker } from "@/app/admin/meeting-rooms/jalali-date-picker";
import { GeneralSettingsForm } from "@/app/admin/meeting-rooms/general-settings-form";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatJalaliDate,
  formatJalaliDateParam,
  JALALI_DATE_INPUT_PLACEHOLDER,
} from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

type AdminMeetingRoomsPageProps = {
  searchParams?: Promise<{
    error?: string;
    exceptionCreated?: string;
    exceptionDeleted?: string;
    exceptionUpdated?: string;
    roomCreated?: string;
    roomDeleted?: string;
    roomId?: string;
    roomUpdated?: string;
    scheduleUpdated?: string;
    view?: string;
  }>;
};

type MeetingRoomView = "details" | "schedule" | "exceptions";

const DAY_LABELS = [
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
  "شنبه",
];

const inputClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-slate-900 outline-none ring-offset-background transition placeholder:text-slate-400 hover:border-slate-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring invalid:border-red-400 invalid:focus-visible:ring-red-200";
const mutedInputClass = cn(inputClass, "text-left");
const panelClass = "overflow-hidden rounded-xl border bg-card shadow-sm";
const panelHeaderClass =
  "flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between";

/* ------------------------------------------------------------------ */
/*  Shared presentation helpers                                       */
/* ------------------------------------------------------------------ */

function getMeetingRoomView(value: string | undefined): MeetingRoomView {
  if (value === "schedule" || value === "exceptions") {
    return value;
  }

  return "details";
}

function getToast(params: Awaited<AdminMeetingRoomsPageProps["searchParams"]>) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  const successMessage =
    (params?.roomCreated && "اتاق جلسه ایجاد شد.") ||
    (params?.roomUpdated && "اتاق جلسه به‌روزرسانی شد.") ||
    (params?.roomDeleted && "اتاق جلسه و نوبت‌های آینده آن حذف شد.") ||
    (params?.scheduleUpdated && "زمان‌بندی اتاق به‌روزرسانی شد.") ||
    (params?.exceptionCreated && "استثنای اتاق ثبت شد.") ||
    (params?.exceptionUpdated && "استثنای اتاق به‌روزرسانی شد.") ||
    (params?.exceptionDeleted && "استثنای اتاق حذف شد.");

  return successMessage
    ? {
        consumeKeys: [
          "roomCreated",
          "roomUpdated",
          "roomDeleted",
          "scheduleUpdated",
          "exceptionCreated",
          "exceptionUpdated",
          "exceptionDeleted",
        ],
        message: successMessage,
        variant: "success" as const,
      }
    : null;
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "good" | "muted" | "neutral";
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium",
        tone === "good" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "muted" && "border-slate-200 bg-slate-50 text-slate-500",
        tone === "neutral" && "border-blue-200 bg-blue-50 text-blue-700",
      )}
    >
      {children}
    </span>
  );
}

function Field({
  children,
  label,
  secondary,
}: {
  children: ReactNode;
  label: string;
  secondary?: string;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-700">
      {label}
      {children}
      {secondary ? (
        <span className="text-xs font-normal text-muted-foreground">{secondary}</span>
      ) : null}
    </label>
  );
}

function ToggleSwitchRow({
  defaultChecked = false,
  description,
  label,
  name,
}: {
  defaultChecked?: boolean;
  description: string;
  label: string;
  name: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span className="grid gap-0.5">
        <span className="text-sm font-medium text-slate-800">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          className="peer sr-only"
          defaultChecked={defaultChecked}
          name={name}
          role="switch"
          type="checkbox"
        />
        <span className="h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2" />
        <span className="pointer-events-none absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:-translate-x-4" />
      </span>
    </label>
  );
}

function DurationField({
  defaultValue,
  label,
  helpText,
}: {
  defaultValue: number;
  label?: string;
  helpText?: string;
}) {
  return (
    <Field label={label ?? "مدت انتظار تا تأیید خودکار"} secondary={helpText}>
      <div className="flex h-10 overflow-hidden rounded-md border border-input bg-background transition focus-within:border-primary focus-within:ring-2 focus-within:ring-ring hover:border-slate-400 has-[:invalid]:border-red-400">
        <input
          className="min-w-0 flex-1 bg-transparent px-3 text-left text-sm text-slate-900 outline-none"
          defaultValue={defaultValue}
          inputMode="numeric"
          max={24}
          min={1}
          name="autoApprovalDelayHours"
          required
          type="number"
        />
        <span
          aria-hidden="true"
          className="inline-flex items-center border-r bg-slate-50 px-3 text-sm text-slate-500"
        >
          ساعت
        </span>
      </div>
    </Field>
  );
}

function RoomContextSelector({
  rooms,
  selectedRoomId,
  view,
}: {
  rooms: Array<{
    id: string;
    isActive: boolean;
    location: string | null;
    name: string;
  }>;
  selectedRoomId: string;
  view: MeetingRoomView;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground shrink-0">اتاق</span>
      <MeetingRoomPicker
        rooms={rooms}
        selectedRoomId={selectedRoomId}
        view={view}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page-level header (shared across all three views)                  */
/* ------------------------------------------------------------------ */

function PageHeader({
  badge,
  icon: Icon,
  roomSelector,
  subtitle,
  title,
}: {
  badge?: ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  roomSelector: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <Icon className="h-5 w-5 shrink-0 text-primary" />
        <div className="grid gap-0.5">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {badge}
        {roomSelector}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  New meeting room form                                              */
/* ------------------------------------------------------------------ */

function NewMeetingRoomForm({ defaultSortOrder }: { defaultSortOrder: number }) {
  return (
    <section className={panelClass}>
      <div className={panelHeaderClass}>
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Plus className="h-5 w-5" />
          </span>
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold">تعریف اتاق جدید</h2>
            <p className="text-xs leading-5 text-muted-foreground">
              ابتدا مشخصات پایه را وارد کنید؛ برنامه هفتگی و استثناها بعد از
              ساخت اتاق در دسترس خواهند بود.
            </p>
          </div>
        </div>
      </div>

      <form action={createMeetingRoomAction} className="grid gap-6 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="نام اتاق">
            <input
              autoFocus
              className={inputClass}
              maxLength={100}
              name="name"
              placeholder="مثلاً اتاق جلسه سپید"
              required
              type="text"
            />
          </Field>
          <Field label="موقعیت">
            <input
              className={inputClass}
              maxLength={120}
              name="location"
              placeholder="مثلاً طبقه سوم"
              type="text"
            />
          </Field>
          <Field label="توضیح">
            <input
              className={inputClass}
              maxLength={300}
              name="description"
              placeholder="توضیح کوتاه اختیاری"
              type="text"
            />
          </Field>
          <Field label="ترتیب نمایش" secondary="عدد کمتر، اتاق را بالاتر در فهرست کاربران نشان می‌دهد.">
            <input
              className={mutedInputClass}
              defaultValue={defaultSortOrder}
              min={0}
              name="sortOrder"
              type="number"
            />
          </Field>
          <div className="md:col-span-2 md:max-w-sm">
            <DurationField
              defaultValue={4}
              helpText="عددی بین ۱ تا ۲۴ ساعت وارد کنید."
            />
          </div>
        </div>

        <div className="grid gap-1 rounded-lg border bg-muted/30 px-4 py-3">
          <ToggleSwitchRow
            defaultChecked
            description="اتاق فعال در صفحه رزرو کاربران نمایش داده می‌شود."
            label="اتاق فعال باشد"
            name="isActive"
          />
          <ToggleSwitchRow
            description="درخواست پس از مدت انتظار و فقط در صورت وجود ظرفیت تأیید می‌شود."
            label="تأیید خودکار درخواست‌ها"
            name="autoApprovalEnabled"
          />
        </div>

        <div className="flex justify-start border-t pt-5">
          <SubmitButton
            className="w-full sm:w-auto sm:min-w-40"
            pendingLabel="در حال ایجاد"
          >
            <Plus className="h-4 w-4" />
            ایجاد اتاق
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Details view section                                               */
/* ------------------------------------------------------------------ */

function DetailsViewSection({
  roomPickerData,
  selectedRoom,
}: {
  roomPickerData: Array<{
    id: string;
    isActive: boolean;
    location: string | null;
    name: string;
  }>;
  selectedRoom: NonNullable<Awaited<ReturnType<typeof fetchRooms>>[0]>;
}) {
  return (
    <section className={cn(panelClass, "min-w-0")}>
      <div className={panelHeaderClass}>
        <PageHeader
          icon={Settings2}
          roomSelector={
            <RoomContextSelector
              rooms={roomPickerData}
              selectedRoomId={selectedRoom.id}
              view="details"
            />
          }
          subtitle="مشخصات و تنظیمات رزرو اتاق را مدیریت کنید."
          title="اطلاعات اتاق"
        />
      </div>

      <GeneralSettingsForm
        deleteAction={deleteMeetingRoomAction}
        roomId={selectedRoom.id}
        roomName={selectedRoom.name}
        updateAction={updateMeetingRoomAction}
      >
        {/* Room info */}
        <div className="grid gap-1">
          <h3 className="text-sm font-semibold text-slate-800">مشخصات اتاق</h3>
          <p className="text-xs text-muted-foreground">
            نام، موقعیت و اطلاعات پایه اتاق جلسه.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="نام">
            <input
              className={inputClass}
              defaultValue={selectedRoom.name}
              maxLength={100}
              name="name"
              required
              type="text"
            />
          </Field>
          <Field label="موقعیت">
            <input
              className={inputClass}
              defaultValue={selectedRoom.location ?? ""}
              maxLength={120}
              name="location"
              type="text"
            />
          </Field>
          <Field label="توضیح">
            <input
              className={inputClass}
              defaultValue={selectedRoom.description ?? ""}
              maxLength={300}
              name="description"
              type="text"
            />
          </Field>
          <Field label="ترتیب نمایش" secondary="عدد کمتر، اتاق را بالاتر نشان می‌دهد.">
            <input
              className={mutedInputClass}
              defaultValue={selectedRoom.sortOrder}
              min={0}
              name="sortOrder"
              type="number"
            />
          </Field>
        </div>

        {/* Booking settings */}
        <div className="grid gap-1">
          <h3 className="text-sm font-semibold text-slate-800">تنظیمات رزرو</h3>
          <p className="text-xs text-muted-foreground">
            وضعیت نمایش و نحوه تأیید رزروها.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <DurationField
            defaultValue={selectedRoom.autoApprovalDelayHours}
            helpText="عددی بین ۱ تا ۲۴ ساعت وارد کنید."
          />
        </div>

        <div className="grid gap-1 rounded-lg border bg-muted/30 px-4 py-3">
          <ToggleSwitchRow
            defaultChecked={selectedRoom.isActive}
            description="اتاق غیرفعال در صفحه رزرو نمایش داده نمی‌شود."
            label="فعال بودن اتاق"
            name="isActive"
          />
          <ToggleSwitchRow
            defaultChecked={selectedRoom.autoApprovalEnabled}
            description="درخواست‌های جدید پس از مدت انتظار و فقط در صورت وجود ظرفیت تأیید می‌شوند."
            label="تأیید خودکار درخواست‌ها"
            name="autoApprovalEnabled"
          />
        </div>

        {/* Advanced settings */}
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-600 outline-none [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            تنظیمات پیشرفته
          </summary>
          <div className="mt-3 rounded-lg border bg-muted/30 p-4">
            <p className="mb-2 text-xs text-muted-foreground">
              مسیر endpoint پردازش زمان‌دار برای تأیید خودکار:
            </p>
            <code
              className="block break-all rounded bg-slate-100 px-3 py-2 text-xs"
              dir="ltr"
            >
              /api/internal/reservations/auto-accept
            </code>
          </div>
        </details>
      </GeneralSettingsForm>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Weekly schedule view section                                       */
/* ------------------------------------------------------------------ */

function ScheduleViewSection({
  roomPickerData,
  selectedRoom,
  weeklySchedules,
}: {
  roomPickerData: Array<{
    id: string;
    isActive: boolean;
    location: string | null;
    name: string;
  }>;
  selectedRoom: NonNullable<Awaited<ReturnType<typeof fetchRooms>>[0]>;
  weeklySchedules: Array<{
    id: string;
    dayOfWeek: number;
    isWorkingDay: boolean;
    startTime: string;
    endTime: string;
  }>;
}) {
  const workingDayCount = weeklySchedules.filter(
    (schedule) => schedule.isWorkingDay,
  ).length;

  return (
    <section className={cn(panelClass, "min-w-0")}>
      <div className={panelHeaderClass}>
        <PageHeader
          badge={
            <StatusPill tone="muted">{workingDayCount} روز قابل رزرو</StatusPill>
          }
          icon={Clock3}
          roomSelector={
            <RoomContextSelector
              rooms={roomPickerData}
              selectedRoomId={selectedRoom.id}
              view="schedule"
            />
          }
          subtitle="روزها و ساعت‌های قابل رزرو اتاق را تنظیم کنید."
          title="برنامه هفتگی"
        />
      </div>

      <form
        action={updateMeetingRoomWeeklyScheduleAction}
        className="m-5 overflow-hidden rounded-lg border"
      >
        <input name="roomId" type="hidden" value={selectedRoom.id} />
        {weeklySchedules.map((schedule, index) => (
          <div
            className={cn(
              "grid gap-3 border-b bg-background px-4 py-3 transition-colors last:border-b-0",
              "lg:grid-cols-[150px_minmax(0,1fr)_minmax(300px,340px)] lg:items-center lg:gap-5",
              schedule.isWorkingDay
                ? "hover:bg-slate-50/60"
                : "bg-slate-50/40 text-slate-400",
            )}
            key={schedule.id}
          >
            <input
              name={`schedules.${index}.scheduleId`}
              type="hidden"
              value={schedule.id}
            />

            {/* Day label */}
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full",
                  schedule.isWorkingDay
                    ? "bg-emerald-500"
                    : "bg-slate-300",
                )}
              />
              <span className="grid gap-0.5">
                <strong
                  className={cn(
                    "text-sm",
                    !schedule.isWorkingDay && "text-slate-400",
                  )}
                >
                  {DAY_LABELS[schedule.dayOfWeek] ?? schedule.dayOfWeek}
                </strong>
                <span className="text-xs text-muted-foreground">
                  {schedule.isWorkingDay ? "روز کاری" : "تعطیل"}
                </span>
              </span>
            </div>

            {/* Reservable toggle */}
            <label
              className={cn(
                "flex h-10 cursor-pointer items-center justify-between gap-3 rounded-md border px-3 text-sm font-medium",
                schedule.isWorkingDay
                  ? "border-slate-200 bg-slate-50 text-slate-700"
                  : "border-slate-200 bg-white text-slate-400",
              )}
            >
              <span>امکان رزرو</span>
              <span className="relative inline-flex shrink-0">
                <input
                  className="peer sr-only"
                  defaultChecked={schedule.isWorkingDay}
                  name={`schedules.${index}.isWorkingDay`}
                  role="switch"
                  type="checkbox"
                />
                <span className="h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2" />
                <span className="pointer-events-none absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:-translate-x-4" />
              </span>
            </label>

            {/* Time fields */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="شروع">
                <input
                  aria-label="ساعت شروع"
                  className={cn(
                    inputClass,
                    "h-10 text-left",
                    !schedule.isWorkingDay && "text-slate-400",
                  )}
                  defaultValue={schedule.startTime}
                  name={`schedules.${index}.startTime`}
                  step={3600}
                  type="time"
                />
              </Field>
              <Field label="پایان">
                <input
                  aria-label="ساعت پایان"
                  className={cn(
                    inputClass,
                    "h-10 text-left",
                    !schedule.isWorkingDay && "text-slate-400",
                  )}
                  defaultValue={schedule.endTime}
                  name={`schedules.${index}.endTime`}
                  step={3600}
                  type="time"
                />
              </Field>
            </div>
          </div>
        ))}

        <div className="flex flex-col gap-2 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            همه تغییرات روزهای هفته با هم ذخیره می‌شوند.
          </p>
          <SubmitButton
            className="w-full sm:w-auto"
            pendingLabel="در حال ذخیره"
            size="sm"
          >
            <Save className="h-4 w-4" />
            ذخیره برنامه هفتگی
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Exceptions view section                                            */
/* ------------------------------------------------------------------ */

function ExceptionsViewSection({
  currentDateParam,
  roomPickerData,
  selectedRoom,
}: {
  currentDateParam: string;
  roomPickerData: Array<{
    id: string;
    isActive: boolean;
    location: string | null;
    name: string;
  }>;
  selectedRoom: NonNullable<Awaited<ReturnType<typeof fetchRooms>>[0]>;
}) {
  return (
    <section className={cn(panelClass, "min-w-0")}>
      <div className={panelHeaderClass}>
        <PageHeader
          badge={
            <StatusPill tone="muted">
              {selectedRoom.exceptions.length} استثنا
            </StatusPill>
          }
          icon={CalendarDays}
          roomSelector={
            <RoomContextSelector
              rooms={roomPickerData}
              selectedRoomId={selectedRoom.id}
              view="exceptions"
            />
          }
          subtitle="برای تاریخ‌های خاص، ساعات یا شرایط رزرو متفاوت تعریف کنید."
          title="استثناهای تقویم"
        />
      </div>

      <div className="grid gap-4 p-5">
        {/* Add exception form */}
        <form
          action={createMeetingRoomScheduleExceptionAction}
          className="grid min-w-0 gap-3 rounded-lg border border-dashed bg-muted/30 p-4 lg:grid-cols-[minmax(140px,170px)_minmax(150px,180px)_minmax(100px,120px)_minmax(100px,120px)_minmax(140px,1fr)_minmax(88px,110px)] lg:items-end"
        >
          <input name="roomId" type="hidden" value={selectedRoom.id} />
          <Field label="تاریخ جلالی">
            <JalaliDatePicker
              defaultValue={currentDateParam}
              inputClassName={mutedInputClass}
              name="date"
              placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
            />
          </Field>
          <div className="grid gap-1.5 text-sm font-medium text-slate-700">
            وضعیت این تاریخ
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 font-normal text-slate-700">
              <input
                className="h-4 w-4 shrink-0 rounded accent-primary"
                defaultChecked
                name="isWorkingDay"
                type="checkbox"
              />
              قابل رزرو باشد
            </label>
          </div>
          <Field label="ساعت شروع">
            <input
              aria-label="ساعت شروع"
              className={mutedInputClass}
              dir="ltr"
              name="startTime"
              placeholder="09:00"
              type="text"
            />
          </Field>
          <Field label="ساعت پایان">
            <input
              aria-label="ساعت پایان"
              className={mutedInputClass}
              dir="ltr"
              name="endTime"
              placeholder="17:00"
              type="text"
            />
          </Field>
          <Field label="دلیل">
            <input
              aria-label="دلیل"
              className={inputClass}
              maxLength={200}
              name="reason"
              placeholder="مثلاً تعطیلی شرکت"
              type="text"
            />
          </Field>
          <SubmitButton
            className="w-full"
            pendingLabel="در حال ثبت"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            افزودن
          </SubmitButton>
        </form>

        {/* Exception list */}
        {selectedRoom.exceptions.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
            استثنایی برای این اتاق ثبت نشده است.
          </p>
        ) : (
          <div className="grid gap-2">
            {selectedRoom.exceptions.map((exception) => (
              <form
                action={updateMeetingRoomScheduleExceptionAction}
                className="grid min-w-0 gap-2 rounded-md border bg-background p-3 lg:grid-cols-[minmax(140px,170px)_minmax(92px,110px)_minmax(82px,110px)_minmax(82px,110px)_minmax(120px,1fr)_minmax(148px,190px)]"
                key={exception.id}
              >
                <input
                  name="exceptionId"
                  type="hidden"
                  value={exception.id}
                />
                <input
                  name="roomId"
                  type="hidden"
                  value={selectedRoom.id}
                />
                <div className="flex items-center text-sm font-medium">
                  {formatJalaliDate(exception.date)}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    className="h-4 w-4 shrink-0 rounded accent-primary"
                    defaultChecked={exception.isWorkingDay}
                    name="isWorkingDay"
                    type="checkbox"
                  />
                  قابل رزرو
                </label>
                <input
                  aria-label="ساعت شروع"
                  className={mutedInputClass}
                  defaultValue={exception.startTime ?? ""}
                  dir="ltr"
                  name="startTime"
                  type="text"
                />
                <input
                  aria-label="ساعت پایان"
                  className={mutedInputClass}
                  defaultValue={exception.endTime ?? ""}
                  dir="ltr"
                  name="endTime"
                  type="text"
                />
                <input
                  aria-label="دلیل"
                  className={inputClass}
                  defaultValue={exception.reason ?? ""}
                  name="reason"
                  type="text"
                />
                <div className="grid grid-cols-2 gap-2">
                  <SubmitButton pendingLabel="ذخیره" size="sm">
                    <Save className="h-4 w-4" />
                    ذخیره
                  </SubmitButton>
                  <Button
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    formAction={deleteMeetingRoomScheduleExceptionAction}
                    size="sm"
                    type="submit"
                    variant="outline"
                  >
                    <Trash2 className="h-4 w-4" />
                    حذف
                  </Button>
                </div>
              </form>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Data fetching helper                                               */
/* ------------------------------------------------------------------ */

type FetchedRoom = Awaited<ReturnType<typeof fetchRooms>>[0];

async function fetchRooms() {
  return db.meetingRoom.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      weeklySchedules: {
        orderBy: { dayOfWeek: "asc" },
      },
      exceptions: {
        orderBy: { date: "asc" },
      },
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default async function AdminMeetingRoomsPage({
  searchParams,
}: AdminMeetingRoomsPageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const toast = getToast(params);
  const rooms = await fetchRooms();
  const selectedRoom =
    rooms.find((room) => room.id === params?.roomId) ?? rooms[0] ?? null;
  const currentDateParam = formatJalaliDateParam(new Date());
  const activeView = getMeetingRoomView(params?.view);
  const isCreatingRoom = params?.view === "new" || rooms.length === 0;
  const defaultSortOrder =
    rooms.reduce((highest, room) => Math.max(highest, room.sortOrder), 0) + 1;
  const weeklySchedules = selectedRoom
    ? [...selectedRoom.weeklySchedules].sort(
        (first, second) =>
          ((first.dayOfWeek + 1) % 7) - ((second.dayOfWeek + 1) % 7),
      )
    : [];

  const roomPickerData = rooms.map((room) => ({
    id: room.id,
    isActive: room.isActive,
    location: room.location,
    name: room.name,
  }));

  return (
    <SpacesReservationSectionShell>
      {toast ? <UrlToast {...toast} /> : null}

      {isCreatingRoom ? (
        <>
          <div className="flex items-center justify-between">
            <div className="grid gap-1">
              <h2 className="text-lg font-semibold">اتاق جدید</h2>
              <p className="text-sm text-muted-foreground">
                یک اتاق جلسه جدید تعریف کنید.
              </p>
            </div>
          </div>
          <NewMeetingRoomForm defaultSortOrder={defaultSortOrder} />
        </>
      ) : selectedRoom ? (
        <main className="grid min-w-0 gap-6">
          {activeView === "details" ? (
            <DetailsViewSection
              roomPickerData={roomPickerData}
              selectedRoom={selectedRoom}
            />
          ) : null}

          {activeView === "schedule" ? (
            <ScheduleViewSection
              roomPickerData={roomPickerData}
              selectedRoom={selectedRoom}
              weeklySchedules={weeklySchedules}
            />
          ) : null}

          {activeView === "exceptions" ? (
            <ExceptionsViewSection
              currentDateParam={currentDateParam}
              roomPickerData={roomPickerData}
              selectedRoom={selectedRoom}
            />
          ) : null}
        </main>
      ) : null}
    </SpacesReservationSectionShell>
  );
}
