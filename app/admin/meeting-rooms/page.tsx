import { UserRole } from "@prisma/client";
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  DoorOpen,
  MapPin,
  Plus,
  Save,
  Settings2,
  Trash2,
  Power,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  createMeetingRoomAction,
  createMeetingRoomScheduleExceptionAction,
  deleteMeetingRoomAction,
  deleteMeetingRoomScheduleExceptionAction,
  setMeetingRoomActiveStatusAction,
  updateMeetingRoomAction,
  updateMeetingRoomScheduleExceptionAction,
  updateMeetingRoomWeeklyScheduleAction,
} from "@/app/admin/meeting-rooms/actions";
import { SpacesReservationSectionShell } from "@/app/admin/_components/spaces-reservation-section";
import { MeetingRoomPicker } from "@/app/admin/meeting-rooms/meeting-room-picker";
import { JalaliDatePicker } from "@/app/admin/meeting-rooms/jalali-date-picker";
import { GeneralSettingsForm } from "@/app/admin/meeting-rooms/general-settings-form";
import { PageHeader } from "@/components/app/page-header";
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
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-slate-900 outline-none ring-offset-background transition placeholder:text-slate-400 hover:border-slate-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring invalid:border-red-400 invalid:focus-visible:ring-red-200";
const mutedInputClass = cn(inputClass, "text-left");
const panelClass = "overflow-hidden rounded-xl border bg-card shadow-sm";
const panelHeaderClass =
  "flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between";

function getMeetingRoomView(value: string | undefined): MeetingRoomView {
  if (value === "schedule" || value === "exceptions") {
    return value;
  }

  return "details";
}

function getMeetingRoomHref(roomId: string, view: MeetingRoomView) {
  return `/admin/meeting-rooms?roomId=${roomId}&view=${view}`;
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
        "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium",
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
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function ToggleSwitch({
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
    <label className="group flex min-h-24 cursor-pointer items-start justify-between gap-4 rounded-lg border bg-background p-4 text-sm transition-colors hover:border-blue-200 hover:bg-blue-50/30">
      <span className="grid gap-1.5">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          className="peer sr-only"
          defaultChecked={defaultChecked}
          name={name}
          role="switch"
          type="checkbox"
        />
        <span className="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50" />
        <span className="pointer-events-none absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:-translate-x-5" />
      </span>
    </label>
  );
}

function DurationField({ defaultValue }: { defaultValue: number }) {
  return (
    <Field label="مدت انتظار تا تأیید خودکار">
      <div className="flex h-11 overflow-hidden rounded-md border border-input bg-background transition focus-within:border-primary focus-within:ring-2 focus-within:ring-ring hover:border-slate-400 has-[:invalid]:border-red-400">
        <input
          aria-describedby="auto-approval-delay-help"
          className="min-w-0 flex-1 bg-transparent px-3 text-left text-sm text-slate-900 outline-none"
          defaultValue={defaultValue}
          inputMode="numeric"
          max={24}
          min={1}
          name="autoApprovalDelayHours"
          required
          type="number"
        />
        <span className="inline-flex items-center border-r bg-slate-50 px-4 text-sm text-slate-500" aria-hidden="true">
          ساعت
        </span>
      </div>
      <span className="text-xs font-normal leading-5 text-muted-foreground" id="auto-approval-delay-help">
        عددی بین ۱ تا ۲۴ ساعت وارد کنید.
      </span>
    </Field>
  );
}

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
          <div className="grid gap-1.5">
            <Field label="ترتیب نمایش">
              <input
                className={mutedInputClass}
                defaultValue={defaultSortOrder}
                min={0}
                name="sortOrder"
                type="number"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              عدد کمتر، اتاق را بالاتر در فهرست کاربران نشان می‌دهد.
            </p>
          </div>
          <div className="grid gap-1.5 md:col-span-2 md:max-w-sm">
            <DurationField defaultValue={4} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <ToggleSwitch defaultChecked description="اتاق فعال در صفحه رزرو کاربران نمایش داده می‌شود." label="اتاق فعال باشد" name="isActive" />
          <ToggleSwitch description="درخواست پس از مدت انتظار و فقط در صورت وجود ظرفیت تأیید می‌شود." label="تأیید خودکار درخواست‌ها" name="autoApprovalEnabled" />
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

function MeetingRoomViewNavigation({
  activeView,
  exceptionCount,
  roomId,
}: {
  activeView: MeetingRoomView;
  exceptionCount: number;
  roomId: string;
}) {
  const items: Array<{
    description: string;
    icon: ReactNode;
    label: string;
    view: MeetingRoomView;
  }> = [
    {
      description: "نام، وضعیت و تأیید خودکار",
      icon: <Settings2 className="h-[18px] w-[18px]" strokeWidth={1.8} />,
      label: "اطلاعات اتاق",
      view: "details",
    },
    {
      description: "روزها و ساعت‌های قابل رزرو",
      icon: <Clock3 className="h-[18px] w-[18px]" strokeWidth={1.8} />,
      label: "برنامه هفتگی",
      view: "schedule",
    },
    {
      description: `${exceptionCount} استثنای ثبت‌شده`,
      icon: <CalendarDays className="h-[18px] w-[18px]" strokeWidth={1.8} />,
      label: "استثناهای تقویم",
      view: "exceptions",
    },
  ];

  return (
    <nav
      aria-label="بخش‌های تنظیمات اتاق"
      className="flex overflow-x-auto border-t bg-slate-50 px-2 pt-2 sm:grid sm:grid-cols-3"
    >
      {items.map((item) => {
        const isActive = item.view === activeView;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative grid min-w-[190px] flex-1 gap-1 rounded-t-lg px-4 py-3 text-right outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:min-w-0",
              isActive
                ? "bg-blue-50/70 text-slate-950 shadow-sm after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 after:bg-primary"
                : "text-slate-600 hover:bg-blue-50/40 hover:text-slate-950 active:bg-blue-50/70",
            )}
            href={getMeetingRoomHref(roomId, item.view)}
            key={item.view}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className={cn(isActive && "text-primary")}>{item.icon}</span>
              {item.label}
            </span>
            <span className="truncate text-xs">{item.description}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default async function AdminMeetingRoomsPage({
  searchParams,
}: AdminMeetingRoomsPageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const toast = getToast(params);
  const rooms = await db.meetingRoom.findMany({
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
  const selectedRoom =
    rooms.find((room) => room.id === params?.roomId) ?? rooms[0] ?? null;
  const currentDateParam = formatJalaliDateParam(new Date());
  const activeRoomsCount = rooms.filter((room) => room.isActive).length;
  const autoApprovedRoomsCount = rooms.filter(
    (room) => room.autoApprovalEnabled,
  ).length;
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

  return (
    <SpacesReservationSectionShell>
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="good">{activeRoomsCount} اتاق فعال</StatusPill>
            <StatusPill>
              {autoApprovedRoomsCount} اتاق با تأیید خودکار
            </StatusPill>
            <Button asChild size="sm">
              <Link href="/admin/meeting-rooms?view=new">
                <Plus className="h-4 w-4" />
                اتاق جدید
              </Link>
            </Button>
          </div>
        }
        subtitle="یک اتاق را انتخاب کنید و مشخصات، برنامه هفتگی و استثناهای آن را تنظیم کنید."
        title="اتاق‌های جلسه"
      />

      {toast ? <UrlToast {...toast} /> : null}

      <section className={cn(panelClass, "p-4")}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="grid min-w-fit gap-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">انتخاب اتاق</h2>
              <StatusPill tone="muted">{rooms.length} اتاق</StatusPill>
            </div>
            <p className="text-xs text-slate-600">
              تنظیمات هر اتاق مستقل است؛ برای ادامه یکی را انتخاب کنید.
            </p>
          </div>
        {rooms.length === 0 ? (
          <div className="m-4 grid justify-items-center gap-3 rounded-lg border border-dashed bg-muted/20 p-6 text-center">
            <DoorOpen className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              هنوز اتاقی تعریف نشده است؛ فرم ساخت اولین اتاق در ادامه آماده است.
            </p>
          </div>
        ) : (
          <MeetingRoomPicker
            rooms={rooms.map((room) => ({
              id: room.id,
              isActive: room.isActive,
              location: room.location,
              name: room.name,
            }))}
            selectedRoomId={
              isCreatingRoom ? undefined : (selectedRoom?.id ?? undefined)
            }
            view={activeView}
          />
        )}
        </div>
      </section>

      {isCreatingRoom ? (
        <NewMeetingRoomForm defaultSortOrder={defaultSortOrder} />
      ) : selectedRoom ? (
        <main className="grid min-w-0 gap-6">
          <section className={cn(panelClass, "min-w-0")}>
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <DoorOpen className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">{selectedRoom.name}</h2>
                  <StatusPill tone={selectedRoom.isActive ? "good" : "muted"}>
                    {selectedRoom.isActive ? "فعال" : "غیرفعال"}
                  </StatusPill>
                  {selectedRoom.autoApprovalEnabled ? (
                    <StatusPill>تأیید خودکار</StatusPill>
                  ) : null}
                </div>
                <p className="flex items-center gap-1 text-xs text-slate-600">
                  <MapPin className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  {selectedRoom.location || "موقعیت ثبت نشده است"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:mr-2">
                <form action={setMeetingRoomActiveStatusAction}>
                  <input name="roomId" type="hidden" value={selectedRoom.id} />
                  <input
                    name="isActive"
                    type="hidden"
                    value={selectedRoom.isActive ? "false" : "true"}
                  />
                  <Button size="sm" type="submit" variant="outline">
                    <Power className="h-4 w-4" />
                    {selectedRoom.isActive ? "غیرفعال کردن" : "فعال کردن"}
                  </Button>
                </form>
              </div>
            </div>
            <MeetingRoomViewNavigation
              activeView={activeView}
              exceptionCount={selectedRoom.exceptions.length}
              roomId={selectedRoom.id}
            />
          </section>

          {activeView === "details" ? (
            <section className={cn(panelClass, "min-w-0")}>
              <div className={panelHeaderClass}>
                <div className="flex items-start gap-3">
                  <Settings2 className="mt-0.5 h-5 w-5 text-primary" />
                  <div className="grid gap-1">
                    <h2 className="text-base font-semibold">
                      تنظیمات عمومی اتاق
                    </h2>
                    <p className="text-xs text-slate-600">
                      اطلاعات اتاق، وضعیت نمایش و نحوه تأیید رزروها را مدیریت کنید.
                    </p>
                  </div>
                </div>
              </div>
              <GeneralSettingsForm
                deleteAction={deleteMeetingRoomAction}
                roomId={selectedRoom.id}
                roomName={selectedRoom.name}
                updateAction={updateMeetingRoomAction}
              >
                <div className="grid gap-6 md:grid-cols-2">
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
                  <Field label="ترتیب نمایش">
                    <input
                      className={mutedInputClass}
                      defaultValue={selectedRoom.sortOrder}
                      min={0}
                      name="sortOrder"
                      type="number"
                    />
                  </Field>
                  <DurationField defaultValue={selectedRoom.autoApprovalDelayHours} />
                </div>
                <div className="grid gap-3 rounded-md bg-muted/40 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <ToggleSwitch defaultChecked={selectedRoom.isActive} description="اتاق غیرفعال در صفحه رزرو کاربران نمایش داده نمی‌شود." label="فعال بودن اتاق" name="isActive" />
                    <div className="grid min-h-24 gap-3 rounded-lg border bg-background p-4 text-sm">
                      <ToggleSwitch defaultChecked={selectedRoom.autoApprovalEnabled} description="درخواست‌های جدید پس از مدت انتظار و فقط در صورت وجود ظرفیت تأیید می‌شوند. درخواست‌های در انتظار قبلی تغییر نمی‌کنند." label="تأیید خودکار درخواست‌ها" name="autoApprovalEnabled" />
                      <details className="group border-t text-xs text-muted-foreground">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-md px-2 font-medium text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                          <span>جزئیات فنی پردازش زمان‌دار</span>
                          <ChevronDown className="h-[18px] w-[18px] transition-transform group-open:rotate-180" />
                        </summary>
                        <code className="block break-all px-2 pb-2 pt-1" dir="ltr">
                          /api/internal/reservations/auto-accept
                        </code>
                      </details>
                    </div>
                  </div>
                </div>
              </GeneralSettingsForm>
            </section>

          ) : null}

          {activeView === "schedule" ? (
            <section className={cn(panelClass, "min-w-0")}>
              <div className={panelHeaderClass}>
                <div className="flex items-center gap-2">
                  <Clock3 className="h-5 w-5 text-primary" />
                  <div>
                    <h2 className="text-base font-semibold">
                      برنامه هفتگی
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      ساعت‌ها باید کامل و با قالب 09:00 باشند؛ تغییرات همه
                      روزها با هم ذخیره می‌شوند.
                    </p>
                  </div>
                </div>
                <StatusPill tone="muted">
                  {
                    weeklySchedules.filter(
                      (schedule) => schedule.isWorkingDay,
                    ).length
                  }{" "}
                  روز قابل رزرو
                </StatusPill>
              </div>
              <form
                action={updateMeetingRoomWeeklyScheduleAction}
                className="m-5 overflow-hidden rounded-xl border"
              >
                <input name="roomId" type="hidden" value={selectedRoom.id} />
                {weeklySchedules.map((schedule, index) => (
                  <div
                    className="grid gap-3 border-b bg-background px-4 py-3.5 transition-colors hover:bg-slate-50/60 lg:grid-cols-[150px_170px_minmax(320px,1fr)] lg:items-start lg:gap-5"
                    key={schedule.id}
                  >
                    <input
                      name={`schedules.${index}.scheduleId`}
                      type="hidden"
                      value={schedule.id}
                    />
                    <div className="flex items-center gap-3 lg:mt-[26px]">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-full",
                          schedule.isWorkingDay
                            ? "bg-emerald-500"
                            : "bg-slate-300",
                        )}
                      />
                      <span className="grid gap-0.5">
                        <strong className="text-sm">
                          {DAY_LABELS[schedule.dayOfWeek] ??
                            schedule.dayOfWeek}
                        </strong>
                        <span className="text-xs text-muted-foreground">
                          {schedule.isWorkingDay ? "روز کاری" : "تعطیل"}
                        </span>
                      </span>
                    </div>
                    <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg border bg-slate-50 px-3 text-sm font-medium text-slate-700 lg:mt-[26px]">
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
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="شروع">
                        <input
                          aria-label="ساعت شروع"
                          className={cn(inputClass, "h-10 text-left")}
                          defaultValue={schedule.startTime}
                          name={`schedules.${index}.startTime`}
                          step={3600}
                          type="time"
                        />
                      </Field>
                      <Field label="پایان">
                        <input
                          aria-label="ساعت پایان"
                          className={cn(inputClass, "h-10 text-left")}
                          defaultValue={schedule.endTime}
                          name={`schedules.${index}.endTime`}
                          step={3600}
                          type="time"
                        />
                      </Field>
                    </div>
                  </div>
                ))}
                <div className="flex flex-col gap-2 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
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

          ) : null}

          {activeView === "exceptions" ? (
            <section className={cn(panelClass, "min-w-0")}>
              <div className={panelHeaderClass}>
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  <div>
                    <h2 className="text-base font-semibold">
                      استثناهای تقویم
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      برای یک تاریخ جلالی، تعطیلی یا ساعت کاری متفاوت تعریف
                      کنید.
                    </p>
                  </div>
                </div>
                <StatusPill tone="muted">
                  {selectedRoom.exceptions.length} استثنا
                </StatusPill>
              </div>

              <div className="grid gap-4 p-5">
                <form
                  action={createMeetingRoomScheduleExceptionAction}
                  className="grid min-w-0 gap-4 rounded-lg border border-dashed bg-muted/30 p-4 lg:grid-cols-[minmax(140px,170px)_minmax(150px,180px)_minmax(100px,120px)_minmax(100px,120px)_minmax(140px,1fr)_minmax(88px,120px)] lg:items-end"
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
                    <label className="flex h-10 items-center gap-2 rounded-md border bg-background px-3 font-normal text-slate-700">
                      <input
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

                {selectedRoom.exceptions.length === 0 ? (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
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
          ) : null}
          </main>
        ) : null}
    </SpacesReservationSectionShell>
  );
}
