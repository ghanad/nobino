import { UserRole } from "@prisma/client";
import {
  CalendarDays,
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
import { MeetingRoomPicker } from "@/app/admin/meeting-rooms/meeting-room-picker";
import { JalaliDatePicker } from "@/app/admin/meeting-rooms/jalali-date-picker";
import { DeleteMeetingRoomButton } from "@/app/admin/meeting-rooms/delete-meeting-room-button";
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
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring";
const mutedInputClass = cn(inputClass, "text-left");
const panelClass = "overflow-hidden rounded-xl border bg-card shadow-sm";
const panelHeaderClass =
  "flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between";

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
            <Field label="مدت انتظار تا تأیید خودکار">
              <div className="flex items-center gap-2">
                <input
                  className={mutedInputClass}
                  defaultValue={4}
                  inputMode="numeric"
                  max={24}
                  min={1}
                  name="autoApprovalDelayHours"
                  type="number"
                />
                <span className="inline-flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                  ساعت
                </span>
              </div>
            </Field>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex min-h-24 items-start justify-between gap-4 rounded-lg border bg-muted/20 p-4 text-sm">
            <span className="grid gap-1">
              <span className="font-medium">اتاق فعال باشد</span>
              <span className="text-xs leading-5 text-muted-foreground">
                اتاق فعال در صفحه رزرو کاربران نمایش داده می‌شود.
              </span>
            </span>
            <input className="mt-1" defaultChecked name="isActive" type="checkbox" />
          </label>
          <label className="flex min-h-24 items-start justify-between gap-4 rounded-lg border bg-muted/20 p-4 text-sm">
            <span className="grid gap-1">
              <span className="font-medium">تأیید خودکار درخواست‌ها</span>
              <span className="text-xs leading-5 text-muted-foreground">
                درخواست پس از مدت انتظار و فقط در صورت وجود ظرفیت تأیید می‌شود.
              </span>
            </span>
            <input
              className="mt-1"
              name="autoApprovalEnabled"
              type="checkbox"
            />
          </label>
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
      icon: <Settings2 className="h-4 w-4" />,
      label: "مشخصات اتاق",
      view: "details",
    },
    {
      description: "روزها و ساعت‌های قابل رزرو",
      icon: <Clock3 className="h-4 w-4" />,
      label: "برنامه هفتگی",
      view: "schedule",
    },
    {
      description: `${exceptionCount} استثنای ثبت‌شده`,
      icon: <CalendarDays className="h-4 w-4" />,
      label: "استثناهای تقویم",
      view: "exceptions",
    },
  ];

  return (
    <nav
      aria-label="بخش‌های تنظیمات اتاق"
      className="grid gap-2 border-t bg-muted/40 p-2 sm:grid-cols-3"
    >
      {items.map((item) => {
        const isActive = item.view === activeView;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "grid min-w-0 gap-1 rounded-lg px-4 py-3 text-right transition-colors",
              isActive
                ? "bg-background text-slate-950 shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-background/70 hover:text-slate-950",
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

  return (
    <div className="grid gap-6" dir="rtl">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="good">{activeRoomsCount} فعال</StatusPill>
            <StatusPill>
              {autoApprovedRoomsCount} با تأیید خودکار
            </StatusPill>
            <Button asChild size="sm">
              <Link href="/admin/meeting-rooms?view=new">
                <Plus className="h-4 w-4" />
                اتاق جدید
              </Link>
            </Button>
          </div>
        }
        subtitle="یک اتاق را انتخاب کنید و مشخصات، برنامه هفتگی یا استثناهای آن را مدیریت کنید."
        title="مدیریت اتاق‌های جلسه"
      />

      {toast ? <UrlToast {...toast} /> : null}

      <section className={panelClass}>
        <div className={panelHeaderClass}>
          <div className="grid gap-1">
            <h2 className="text-base font-semibold">انتخاب اتاق</h2>
            <p className="text-xs text-muted-foreground">
              تنظیمات هر اتاق مستقل است؛ برای ادامه یکی را انتخاب کنید.
            </p>
          </div>
          <StatusPill tone="muted">{rooms.length} اتاق</StatusPill>
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
      </section>

      {isCreatingRoom ? (
        <NewMeetingRoomForm defaultSortOrder={defaultSortOrder} />
      ) : selectedRoom ? (
        <main className="grid min-w-0 gap-6">
          <section className={cn(panelClass, "min-w-0")}>
            <div className={panelHeaderClass}>
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
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {selectedRoom.location || "موقعیت ثبت نشده است"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DeleteMeetingRoomButton
                  action={deleteMeetingRoomAction}
                  roomId={selectedRoom.id}
                  roomName={selectedRoom.name}
                />
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
                      مشخصات و رفتار اتاق
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      اطلاعات نمایشی، وضعیت دسترسی و شیوه تأیید درخواست‌ها
                    </p>
                  </div>
                </div>
              </div>
              <form
                action={updateMeetingRoomAction}
                className="grid gap-4 p-5"
              >
                <input name="roomId" type="hidden" value={selectedRoom.id} />
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
                  <Field label="ترتیب نمایش">
                    <input
                      className={mutedInputClass}
                      defaultValue={selectedRoom.sortOrder}
                      min={0}
                      name="sortOrder"
                      type="number"
                    />
                  </Field>
                  <Field label="مدت انتظار تا تأیید خودکار">
                    <div className="flex items-center gap-2">
                      <input
                        className={mutedInputClass}
                        defaultValue={selectedRoom.autoApprovalDelayHours}
                        inputMode="numeric"
                        max={24}
                        min={1}
                        name="autoApprovalDelayHours"
                        type="number"
                      />
                      <span className="inline-flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                        ساعت
                      </span>
                    </div>
                  </Field>
                </div>
                <div className="grid gap-3 rounded-md bg-muted/40 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex min-h-24 items-start justify-between gap-3 rounded-lg border bg-background p-4 text-sm">
                      <span className="grid gap-1">
                        <span className="font-medium">فعال بودن اتاق</span>
                        <span className="text-xs leading-5 text-muted-foreground">
                          اتاق غیرفعال در صفحه رزرو کاربران نمایش داده نمی‌شود.
                        </span>
                      </span>
                      <input
                        className="mt-1"
                        defaultChecked={selectedRoom.isActive}
                        name="isActive"
                        type="checkbox"
                      />
                    </label>
                    <div className="grid min-h-24 gap-3 rounded-lg border bg-background p-4 text-sm">
                      <label className="flex items-start justify-between gap-3">
                        <span className="grid gap-1">
                          <span className="font-medium">
                            تأیید خودکار درخواست‌ها
                          </span>
                          <span className="text-xs leading-5 text-muted-foreground">
                            درخواست‌های جدید پس از مدت انتظار و فقط در صورت وجود
                            ظرفیت تأیید می‌شوند. درخواست‌های در انتظار قبلی تغییر
                            نمی‌کنند.
                          </span>
                        </span>
                        <input
                          className="mt-1"
                          defaultChecked={selectedRoom.autoApprovalEnabled}
                          name="autoApprovalEnabled"
                          type="checkbox"
                        />
                      </label>
                      <details className="border-t pt-3 text-xs text-muted-foreground">
                        <summary className="cursor-pointer font-medium text-slate-600">
                          جزئیات فنی پردازش زمان‌دار
                        </summary>
                        <code className="mt-2 block break-all" dir="ltr">
                          /api/internal/reservations/auto-accept
                        </code>
                      </details>
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <SubmitButton
                      className="w-full sm:w-auto sm:min-w-36"
                      pendingLabel="در حال ذخیره"
                    >
                      <Save className="h-4 w-4" />
                      ذخیره اتاق
                    </SubmitButton>
                  </div>
                </div>
              </form>
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
                      ساعت‌ها باید کامل و با قالب 09:00 باشند؛ تغییر هر روز را
                      از همان ردیف ذخیره کنید.
                    </p>
                  </div>
                </div>
                <StatusPill tone="muted">
                  {
                    selectedRoom.weeklySchedules.filter(
                      (schedule) => schedule.isWorkingDay,
                    ).length
                  }{" "}
                  روز قابل رزرو
                </StatusPill>
              </div>
              <div className="grid gap-2 p-3">
                <div className="hidden grid-cols-[140px_120px_1fr_140px] gap-3 px-3 pb-1 text-xs font-medium text-muted-foreground lg:grid">
                  <span>روز</span>
                  <span>وضعیت</span>
                  <span>بازه قابل رزرو</span>
                  <span>عملیات</span>
                </div>
                {selectedRoom.weeklySchedules.map((schedule) => (
                  <form
                    action={updateMeetingRoomWeeklyScheduleAction}
                    className="grid gap-3 rounded-md border bg-background p-3 lg:grid-cols-[140px_120px_1fr_140px]"
                    key={schedule.id}
                  >
                    <input name="scheduleId" type="hidden" value={schedule.id} />
                    <input name="roomId" type="hidden" value={selectedRoom.id} />
                    <div className="flex items-center gap-2 font-medium">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      {DAY_LABELS[schedule.dayOfWeek] ?? schedule.dayOfWeek}
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        defaultChecked={schedule.isWorkingDay}
                        name="isWorkingDay"
                        type="checkbox"
                      />
                      این روز قابل رزرو است
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="grid gap-1 text-xs text-muted-foreground">
                        <span className="lg:hidden">شروع</span>
                        <input
                          aria-label="ساعت شروع"
                          className={mutedInputClass}
                          defaultValue={schedule.startTime}
                          dir="ltr"
                          name="startTime"
                          type="text"
                        />
                      </label>
                      <label className="grid gap-1 text-xs text-muted-foreground">
                        <span className="lg:hidden">پایان</span>
                        <input
                          aria-label="ساعت پایان"
                          className={mutedInputClass}
                          defaultValue={schedule.endTime}
                          dir="ltr"
                          name="endTime"
                          type="text"
                        />
                      </label>
                    </div>
                    <SubmitButton pendingLabel="در حال ذخیره" size="sm">
                      <Save className="h-4 w-4" />
                      ذخیره
                    </SubmitButton>
                  </form>
                ))}
              </div>
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
    </div>
  );
}
