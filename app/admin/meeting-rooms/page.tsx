import { UserRole } from "@prisma/client";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  DoorOpen,
  MapPin,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  createMeetingRoomAction,
  createMeetingRoomScheduleExceptionAction,
  deleteMeetingRoomScheduleExceptionAction,
  updateMeetingRoomAction,
  updateMeetingRoomScheduleExceptionAction,
  updateMeetingRoomWeeklyScheduleAction,
} from "@/app/admin/meeting-rooms/actions";
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
    roomId?: string;
    roomUpdated?: string;
    scheduleUpdated?: string;
  }>;
};

const DAY_LABELS = [
  "یک شنبه",
  "دو شنبه",
  "سه شنبه",
  "چهار شنبه",
  "پنج شنبه",
  "جمعه",
  "شنبه",
];

const inputClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring";
const mutedInputClass = cn(inputClass, "text-left");
const panelClass = "rounded-lg border bg-card";
const panelHeaderClass =
  "flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between";

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
    (params?.scheduleUpdated && "زمان‌بندی اتاق به‌روزرسانی شد.") ||
    (params?.exceptionCreated && "استثنای اتاق ثبت شد.") ||
    (params?.exceptionUpdated && "استثنای اتاق به‌روزرسانی شد.") ||
    (params?.exceptionDeleted && "استثنای اتاق حذف شد.");

  return successMessage
    ? {
        consumeKeys: [
          "roomCreated",
          "roomUpdated",
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

export default async function AdminMeetingRoomsPage({
  searchParams,
}: AdminMeetingRoomsPageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const toast = getToast(params);
  const rooms = await db.meetingRoom.findMany({
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

  return (
    <div className="grid gap-6" dir="rtl">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="good">{activeRoomsCount} فعال</StatusPill>
            <StatusPill>{autoApprovedRoomsCount} auto accept اتاق</StatusPill>
          </div>
        }
        subtitle="تعریف اتاق‌ها، تایید خودکار، زمان‌بندی مستقل و استثناهای تاریخ‌محور"
        title="مدیریت اتاق‌های جلسه"
      />

      {toast ? <UrlToast {...toast} /> : null}

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="order-2 grid min-w-0 content-start gap-4 xl:order-1">
          <section className={panelClass}>
            <div className={panelHeaderClass}>
              <div>
                <h2 className="text-base font-semibold">اتاق‌ها</h2>
                <p className="text-xs text-muted-foreground">
                  اتاق را انتخاب کنید و تنظیمات همان اتاق را ویرایش کنید.
                </p>
              </div>
              <StatusPill tone="muted">{rooms.length} اتاق</StatusPill>
            </div>
            <div className="grid gap-2 p-3">
              {rooms.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  هنوز اتاقی تعریف نشده است.
                </p>
              ) : (
                rooms.map((room) => {
                  const isSelected = room.id === selectedRoom?.id;

                  return (
                    <Button
                      asChild
                      className={cn(
                        "h-auto justify-start whitespace-normal px-3 py-3 text-right",
                        isSelected &&
                          "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                      )}
                      key={room.id}
                      variant={isSelected ? "default" : "outline"}
                    >
                      <Link
                        className="grid w-full grid-cols-[1fr_auto] items-center gap-3"
                        href={`/admin/meeting-rooms?roomId=${room.id}`}
                      >
                        <span className="grid min-w-0 gap-1">
                          <span className="truncate font-semibold">
                            {room.name}
                          </span>
                          <span
                            className={cn(
                              "flex flex-wrap items-center gap-2 text-xs",
                              isSelected
                                ? "text-primary-foreground/80"
                                : "text-muted-foreground",
                            )}
                          >
                          <span>{room.location || "بدون موقعیت"}</span>
                          <span>ترتیب {room.sortOrder}</span>
                          <span>{room.autoApprovalDelayHours} ساعت</span>
                        </span>
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          {room.isActive ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <span className="text-xs">غیرفعال</span>
                          )}
                          {room.autoApprovalEnabled ? (
                            <Sparkles className="h-4 w-4" />
                          ) : null}
                        </span>
                      </Link>
                    </Button>
                  );
                })
              )}
            </div>
          </section>

          <section className={panelClass}>
            <div className={panelHeaderClass}>
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold">اتاق جدید</h2>
              </div>
            </div>
            <form action={createMeetingRoomAction} className="grid gap-3 p-5">
              <Field label="نام اتاق">
                <input
                  className={inputClass}
                  maxLength={100}
                  name="name"
                  placeholder="مثلا اتاق جلسه سفید"
                  type="text"
                />
              </Field>
              <Field label="موقعیت">
                <input
                  className={inputClass}
                  maxLength={120}
                  name="location"
                  placeholder="مثلا طبقه سوم"
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
              <Field label="ترتیب نمایش">
                <input
                  className={mutedInputClass}
                  defaultValue={rooms.length + 1}
                  name="sortOrder"
                  type="number"
                />
              </Field>
              <Field label="مدت انتظار auto accept">
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
              <div className="grid gap-2 rounded-md bg-muted/40 p-3">
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>فعال</span>
                  <input defaultChecked name="isActive" type="checkbox" />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Auto accept اتاق جلسه</span>
                  <input name="autoApprovalEnabled" type="checkbox" />
                </label>
                <p className="text-xs leading-5 text-muted-foreground">
                  اگر فعال باشد، درخواست‌های این اتاق بعد از مدت بالا و در صورت
                  وجود ظرفیت تایید می‌شوند. این تنظیم از auto accept رزرو
                  سیستم‌ها مستقل است.
                </p>
              </div>
              <SubmitButton pendingLabel="در حال ایجاد">
                <Plus className="h-4 w-4" />
                ایجاد اتاق
              </SubmitButton>
            </form>
          </section>
        </aside>

        {selectedRoom ? (
          <main className="order-1 grid min-w-0 gap-6 xl:order-2">
            <section className={cn(panelClass, "min-w-0")}>
              <div className={panelHeaderClass}>
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <DoorOpen className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold">
                      {selectedRoom.name}
                    </h2>
                    <StatusPill
                      tone={selectedRoom.isActive ? "good" : "muted"}
                    >
                      {selectedRoom.isActive ? "فعال" : "غیرفعال"}
                    </StatusPill>
                    {selectedRoom.autoApprovalEnabled ? (
                      <StatusPill>Auto accept اتاق جلسه</StatusPill>
                    ) : null}
                  </div>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {selectedRoom.location || "موقعیت ثبت نشده است"}
                  </p>
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
                  <Field label="ترتیب">
                    <input
                      className={mutedInputClass}
                      defaultValue={selectedRoom.sortOrder}
                      name="sortOrder"
                      type="number"
                    />
                  </Field>
                  <Field label="مدت انتظار auto accept">
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
                    <label className="flex min-h-16 items-start justify-between gap-3 rounded-md border bg-background p-3 text-sm">
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
                    <label className="flex min-h-16 items-start justify-between gap-3 rounded-md border bg-background p-3 text-sm">
                      <span className="grid gap-1">
                        <span className="font-medium">
                          Auto accept اتاق جلسه
                        </span>
                        <span className="text-xs leading-5 text-muted-foreground">
                          درخواست‌های این اتاق بعد از مدت انتظار بالا و پس از
                          بررسی ظرفیت تایید می‌شوند. این تنظیم مستقل از auto
                          accept رزرو سیستم‌هاست.
                        </span>
                        <span className="text-xs leading-5 text-muted-foreground">
                          پردازش زمان‌دار با همان endpoint auto accept انجام
                          می‌شود:{" "}
                          <code dir="ltr">
                            /api/internal/reservations/auto-accept
                          </code>
                        </span>
                      </span>
                      <input
                        className="mt-1"
                        defaultChecked={selectedRoom.autoApprovalEnabled}
                        name="autoApprovalEnabled"
                        type="checkbox"
                      />
                    </label>
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

            <section className={cn(panelClass, "min-w-0")}>
              <div className={panelHeaderClass}>
                <div className="flex items-center gap-2">
                  <Clock3 className="h-5 w-5 text-primary" />
                  <div>
                    <h2 className="text-base font-semibold">
                      زمان‌بندی هفتگی
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      بازه‌ها باید روی ساعت کامل و با قالب 09:00 باشند.
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid gap-2 p-3">
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
                      قابل رزرو
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        aria-label="ساعت شروع"
                        className={mutedInputClass}
                        defaultValue={schedule.startTime}
                        dir="ltr"
                        name="startTime"
                        type="text"
                      />
                      <input
                        aria-label="ساعت پایان"
                        className={mutedInputClass}
                        defaultValue={schedule.endTime}
                        dir="ltr"
                        name="endTime"
                        type="text"
                      />
                    </div>
                    <SubmitButton pendingLabel="در حال ذخیره" size="sm">
                      <Save className="h-4 w-4" />
                      ذخیره
                    </SubmitButton>
                  </form>
                ))}
              </div>
            </section>

            <section className={cn(panelClass, "min-w-0")}>
              <div className={panelHeaderClass}>
                <div className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-primary" />
                  <div>
                    <h2 className="text-base font-semibold">
                      استثناهای تاریخ‌محور
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      تاریخ‌ها جلالی هستند و برای همین اتاق ثبت می‌شوند.
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
                  className="grid min-w-0 gap-2 rounded-md border border-dashed bg-muted/30 p-4 lg:grid-cols-[minmax(120px,150px)_minmax(92px,110px)_minmax(82px,110px)_minmax(82px,110px)_minmax(120px,1fr)_minmax(88px,130px)]"
                >
                  <input name="roomId" type="hidden" value={selectedRoom.id} />
                  <input
                    aria-label="تاریخ"
                    className={mutedInputClass}
                    defaultValue={currentDateParam}
                    dir="ltr"
                    name="date"
                    placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
                    type="text"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input defaultChecked name="isWorkingDay" type="checkbox" />
                    قابل رزرو
                  </label>
                  <input
                    aria-label="ساعت شروع"
                    className={mutedInputClass}
                    dir="ltr"
                    name="startTime"
                    placeholder="09:00"
                    type="text"
                  />
                  <input
                    aria-label="ساعت پایان"
                    className={mutedInputClass}
                    dir="ltr"
                    name="endTime"
                    placeholder="17:00"
                    type="text"
                  />
                  <input
                    aria-label="دلیل"
                    className={inputClass}
                    name="reason"
                    placeholder="دلیل"
                    type="text"
                  />
                  <SubmitButton pendingLabel="در حال ثبت" size="sm">
                    <Plus className="h-4 w-4" />
                    ثبت
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
          </main>
        ) : (
          <section
            className={cn(
              panelClass,
              "order-1 grid place-items-center p-10 xl:order-2",
            )}
          >
            <div className="grid justify-items-center gap-3 text-center">
              <DoorOpen className="h-10 w-10 text-muted-foreground" />
              <h2 className="text-lg font-semibold">اتاقی انتخاب نشده است</h2>
              <p className="text-sm text-muted-foreground">
                یک اتاق جدید بسازید تا تنظیمات زمان‌بندی و استثناها نمایش داده
                شود.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
