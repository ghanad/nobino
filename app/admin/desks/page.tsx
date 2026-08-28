import { UserRole } from "@prisma/client";
import {
  Building2,
  CalendarDays,
  Clock3,
  Globe,
  LayoutGrid,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  createDeskAction,
  deleteBuildingExceptionAction,
  updateDeskSettingsAction,
  updateBuildingDesksAction,
  updateBuildingScheduleAction,
  upsertBuildingExceptionAction,
} from "@/app/admin/desks/actions";
import { SpacesReservationSectionShell } from "@/app/admin/_components/spaces-reservation-section";
import {
  AdminDeskForm,
  AdminDeskTrackedSubmitButton,
} from "@/app/admin/desks/admin-desk-form";
import { BuildingPicker } from "@/app/admin/desks/building-picker";
import { PageHeader } from "@/components/app/page-header";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatJalaliDate } from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

type Props = {
  searchParams?: Promise<Record<string, string | undefined>>;
};

type DeskView = "desks" | "exceptions" | "policy" | "schedule";

const DAYS = [
  { dayOfWeek: 6, label: "شنبه" },
  { dayOfWeek: 0, label: "یکشنبه" },
  { dayOfWeek: 1, label: "دوشنبه" },
  { dayOfWeek: 2, label: "سه‌شنبه" },
  { dayOfWeek: 3, label: "چهارشنبه" },
  { dayOfWeek: 4, label: "پنجشنبه" },
  { dayOfWeek: 5, label: "جمعه" },
];

const inputClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-slate-900 outline-none ring-offset-background transition placeholder:text-slate-400 hover:border-slate-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring";
const panelClass = "overflow-hidden rounded-xl border bg-card shadow-sm";
const panelHeaderClass =
  "flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getView(value: string | undefined): DeskView {
  if (value === "schedule" || value === "exceptions" || value === "policy") {
    return value;
  }
  return "desks";
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "good" | "muted" | "neutral" | "global";
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium",
        tone === "good" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "muted" && "border-slate-200 bg-slate-50 text-slate-500",
        tone === "neutral" && "border-blue-200 bg-blue-50 text-blue-700",
        tone === "global" && "border-purple-200 bg-purple-50 text-purple-700",
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
  description?: string;
  label: string;
  name: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border bg-slate-50/70 px-3.5 py-3 text-sm transition hover:border-blue-200">
      <span className="grid gap-0.5">
        <span className="font-medium text-slate-800">{label}</span>
        {description ? (
          <span className="text-xs leading-5 text-muted-foreground">
            {description}
          </span>
        ) : null}
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

/* ------------------------------------------------------------------ */
/*  Page-level header                                                  */
/* ------------------------------------------------------------------ */

function ViewPageHeader({
  badge,
  buildingSelector,
  description,
  icon: Icon,
  title,
}: {
  badge?: ReactNode;
  buildingSelector?: ReactNode;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <Icon className="h-5 w-5 shrink-0 text-primary" />
        <div className="grid gap-0.5">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {badge}
        {buildingSelector}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Desks list view                                                    */
/* ------------------------------------------------------------------ */

function DesksListView({
  activeDeskCount,
  building,
  buildings,
  defaultDeskSortOrder,
}: {
  activeDeskCount: number;
  building: BuildingWithDetails;
  buildings: BuildingPickerData[];
  defaultDeskSortOrder: number;
}) {
  const hasDesks = building.desks.length > 0;

  return (
    <section className={cn(panelClass, "min-w-0")}>
      <div className={panelHeaderClass}>
        <ViewPageHeader
          badge={
            <StatusPill tone="good">{activeDeskCount} میز فعال</StatusPill>
          }
          buildingSelector={
            <BuildingPicker
              buildings={buildings}
              selectedBuildingId={building.id}
              view="desks"
            />
          }
          description="مشخصات میزها را مدیریت کنید؛ تغییرات با هم ذخیره می‌شوند."
          icon={LayoutGrid}
          title="میزهای ساختمان"
        />
      </div>

      {hasDesks ? (
        <AdminDeskForm
          action={updateBuildingDesksAction}
          className="grid gap-4 p-5"
          trackChanges
        >
          <input name="buildingId" type="hidden" value={building.id} />
          <input
            name="deskCount"
            type="hidden"
            value={building.desks.length}
          />

          <div className="grid gap-3">
            {building.desks.map((desk, index) => (
              <div
                className="grid gap-3 rounded-lg border bg-background p-4 transition hover:border-slate-300 sm:grid-cols-[minmax(0,1fr)_auto]"
                key={desk.id}
              >
                <input
                  name={`desks.${index}.deskId`}
                  type="hidden"
                  value={desk.id}
                />
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px]">
                  <Field label="نام میز">
                    <input
                      className={inputClass}
                      defaultValue={desk.name}
                      name={`desks.${index}.name`}
                      required
                    />
                  </Field>
                  <Field label="ترتیب">
                    <input
                      className={cn(inputClass, "text-left")}
                      defaultValue={desk.sortOrder}
                      min={0}
                      name={`desks.${index}.sortOrder`}
                      type="number"
                    />
                  </Field>
                </div>
                <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:justify-center">
                  <StatusPill tone={desk.active ? "good" : "muted"}>
                    {desk.active ? "فعال" : "غیرفعال"}
                  </StatusPill>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                    <input
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      defaultChecked={desk.active}
                      name={`desks.${index}.active`}
                      type="checkbox"
                    />
                    قابل رزرو
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              همه تغییرات میزهای موجود با هم ذخیره می‌شوند.
            </p>
            <AdminDeskTrackedSubmitButton
              className="w-full sm:w-auto"
              pendingLabel="در حال ذخیره"
              size="sm"
            >
              <Save className="h-4 w-4" />
              ذخیره تغییرات میزها
            </AdminDeskTrackedSubmitButton>
          </div>
        </AdminDeskForm>
      ) : (
        <div className="grid justify-items-center gap-3 px-4 py-10 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <LayoutGrid className="h-6 w-6" />
          </span>
          <div>
            <p className="font-medium text-slate-700">
              هنوز میزی برای این ساختمان تعریف نشده است.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              از فرم زیر اولین میز را اضافه کنید.
            </p>
          </div>
        </div>
      )}

      {/* Add desk form — always visible below the list or empty state */}
      <div className="border-t p-5">
        <AdminDeskForm
          action={createDeskAction}
          className="grid gap-4 rounded-lg border border-dashed border-blue-300 bg-blue-50/30 p-4 sm:grid-cols-[minmax(0,1fr)_100px_auto] sm:items-end"
          resetOnSuccess
        >
          <input name="buildingId" type="hidden" value={building.id} />
          <Field label="نام میز">
            <input
              className={inputClass}
              name="name"
              placeholder="مثلاً میز ۱۷"
              required
            />
          </Field>
          <Field label="ترتیب">
            <input
              className={cn(inputClass, "text-left")}
              defaultValue={defaultDeskSortOrder}
              min={0}
              name="sortOrder"
              type="number"
            />
          </Field>
          <SubmitButton
            className="w-full"
            pendingLabel="در حال افزودن"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            افزودن میز
          </SubmitButton>
        </AdminDeskForm>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Weekly schedule view                                               */
/* ------------------------------------------------------------------ */

function ScheduleView({
  building,
  buildings,
}: {
  building: BuildingWithDetails;
  buildings: BuildingPickerData[];
}) {
  const workingDayCount = building.weeklySchedules.filter(
    (s) => s.isWorkingDay,
  ).length;

  return (
    <section className={cn(panelClass, "min-w-0")}>
      <div className={panelHeaderClass}>
        <ViewPageHeader
          badge={
            <StatusPill tone="muted">
              {workingDayCount} روز قابل رزرو
            </StatusPill>
          }
          buildingSelector={
            <BuildingPicker
              buildings={buildings}
              selectedBuildingId={building.id}
              view="schedule"
            />
          }
          description="روزها و ساعت‌های قابل رزرو میز را تنظیم کنید."
          icon={Clock3}
          title="برنامه هفتگی"
        />
      </div>

      <AdminDeskForm
        action={updateBuildingScheduleAction}
        className="m-5 overflow-hidden rounded-lg border"
        trackChanges
      >
        <input name="buildingId" type="hidden" value={building.id} />
        {DAYS.map(({ dayOfWeek, label }) => {
          const schedule = building.weeklySchedules.find(
            (item) => item.dayOfWeek === dayOfWeek,
          );
          const isWorkingDay = Boolean(schedule?.isWorkingDay);

          return (
            <div
              className={cn(
                "grid gap-3 border-b bg-background px-4 py-3 transition-colors last:border-b-0",
                "lg:grid-cols-[150px_minmax(0,1fr)_minmax(300px,340px)] lg:items-center lg:gap-5",
                isWorkingDay
                  ? "hover:bg-slate-50/60"
                  : "bg-slate-50/40 text-slate-400",
              )}
              key={dayOfWeek}
            >
              <input
                name={`schedules.${dayOfWeek}.dayOfWeek`}
                type="hidden"
                value={dayOfWeek}
              />
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    isWorkingDay ? "bg-emerald-500" : "bg-slate-300",
                  )}
                />
                <span className="grid gap-0.5">
                  <strong
                    className={cn(
                      "text-sm",
                      !isWorkingDay && "text-slate-400",
                    )}
                  >
                    {label}
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    {isWorkingDay ? "روز کاری" : "تعطیل"}
                  </span>
                </span>
              </div>
              <label
                className={cn(
                  "flex h-10 cursor-pointer items-center justify-between gap-3 rounded-md border px-3 text-sm font-medium",
                  isWorkingDay
                    ? "border-slate-200 bg-slate-50 text-slate-700"
                    : "border-slate-200 bg-white text-slate-400",
                )}
              >
                <span>امکان رزرو</span>
                <span className="relative inline-flex shrink-0">
                  <input
                    className="peer sr-only"
                    defaultChecked={isWorkingDay}
                    name={`schedules.${dayOfWeek}.isWorkingDay`}
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
                    className={cn(
                      inputClass,
                      "h-10 text-left",
                      !isWorkingDay && "text-slate-400",
                    )}
                    defaultValue={schedule?.startTime ?? "09:00"}
                    name={`schedules.${dayOfWeek}.startTime`}
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
                      !isWorkingDay && "text-slate-400",
                    )}
                    defaultValue={schedule?.endTime ?? "17:00"}
                    name={`schedules.${dayOfWeek}.endTime`}
                    step={3600}
                    type="time"
                  />
                </Field>
              </div>
            </div>
          );
        })}
        <div className="flex flex-col gap-2 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            همه تغییرات روزهای هفته با هم ذخیره می‌شوند.
          </p>
          <AdminDeskTrackedSubmitButton
            className="w-full sm:w-auto"
            pendingLabel="در حال ذخیره"
            size="sm"
          >
            <Save className="h-4 w-4" />
            ذخیره برنامه هفتگی
          </AdminDeskTrackedSubmitButton>
        </div>
      </AdminDeskForm>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Exceptions view                                                    */
/* ------------------------------------------------------------------ */

function ExceptionsView({
  building,
  buildings,
}: {
  building: BuildingWithDetails;
  buildings: BuildingPickerData[];
}) {
  const hasExceptions = building.exceptions.length > 0;

  return (
    <section className={cn(panelClass, "min-w-0")}>
      <div className={panelHeaderClass}>
        <ViewPageHeader
          badge={
            <StatusPill tone="muted">
              {building.exceptions.length} مورد
            </StatusPill>
          }
          buildingSelector={
            <BuildingPicker
              buildings={buildings}
              selectedBuildingId={building.id}
              view="exceptions"
            />
          }
          description="برای تاریخ‌های خاص، ساعات یا شرایط رزرو متفاوت تعریف کنید."
          icon={CalendarDays}
          title="استثناهای تقویم"
        />
      </div>

      <div className="grid gap-4 p-5">
        {/* Add exception form */}
        <AdminDeskForm
          action={upsertBuildingExceptionAction}
          className="grid min-w-0 gap-3 rounded-lg border border-dashed bg-muted/30 p-4 lg:grid-cols-[minmax(140px,170px)_minmax(150px,180px)_minmax(100px,120px)_minmax(100px,120px)_minmax(140px,1fr)_minmax(88px,110px)] lg:items-end"
          resetOnSuccess
        >
          <input name="buildingId" type="hidden" value={building.id} />
          <Field label="تاریخ">
            <JalaliDatePicker
              inputClassName="h-10"
              name="date"
              required
            />
          </Field>
          <div className="grid gap-1.5 text-sm font-medium text-slate-700">
            وضعیت
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 font-normal text-slate-700">
              <input
                className="h-4 w-4 shrink-0 rounded accent-primary"
                defaultChecked
                name="isWorkingDay"
                type="checkbox"
              />
              روز کاری
            </label>
          </div>
          <Field label="شروع">
            <input
              aria-label="ساعت شروع"
              className={cn(inputClass, "text-left")}
              defaultValue="09:00"
              name="startTime"
              step={3600}
              type="time"
            />
          </Field>
          <Field label="پایان">
            <input
              aria-label="ساعت پایان"
              className={cn(inputClass, "text-left")}
              defaultValue="17:00"
              name="endTime"
              step={3600}
              type="time"
            />
          </Field>
          <Field label="دلیل (اختیاری)">
            <input
              className={inputClass}
              maxLength={200}
              name="reason"
              placeholder="مثلاً تعطیلی رسمی"
            />
          </Field>
          <SubmitButton
            className="w-full"
            pendingLabel="در حال ثبت"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            ثبت استثنا
          </SubmitButton>
        </AdminDeskForm>

        {/* Exception list */}
        {!hasExceptions ? (
          <div className="grid justify-items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
            <CalendarDays className="h-8 w-8 text-slate-300" />
            <p className="text-sm text-muted-foreground">
              هنوز استثنایی برای این ساختمان ثبت نشده است.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {building.exceptions.map((exception) => (
              <div
                className="flex flex-col gap-3 rounded-lg border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
                key={exception.id}
              >
                <div className="grid gap-1">
                  <strong className="text-sm">
                    {formatJalaliDate(exception.date)}
                  </strong>
                  <span className="text-xs leading-5 text-slate-600">
                    {exception.isWorkingDay
                      ? `${exception.startTime} تا ${exception.endTime}`
                      : "تعطیل"}
                    {exception.reason ? ` · ${exception.reason}` : ""}
                  </span>
                </div>
                <AdminDeskForm action={deleteBuildingExceptionAction}>
                  <input
                    name="exceptionId"
                    type="hidden"
                    value={exception.id}
                  />
                  <input
                    name="buildingId"
                    type="hidden"
                    value={building.id}
                  />
                  <SubmitButton
                    className="w-full sm:w-auto"
                    pendingLabel="در حال حذف"
                    size="sm"
                    variant="outline"
                  >
                    <Trash2 className="h-4 w-4" />
                    حذف
                  </SubmitButton>
                </AdminDeskForm>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Reservation policy view (global)                                   */
/* ------------------------------------------------------------------ */

function PolicyView({
  settings,
}: {
  settings: Awaited<ReturnType<typeof fetchSettings>>;
}) {
  return (
    <section className={cn(panelClass, "min-w-0")}>
      <div className={panelHeaderClass}>
        <ViewPageHeader
          badge={
            <StatusPill tone="global">
              <Globe className="mr-1 h-3 w-3" />
              مشترک بین همه ساختمان‌ها
            </StatusPill>
          }
          description="این تنظیمات روی درخواست رزرو میز در تمام ساختمان‌ها اعمال می‌شود."
          icon={SlidersHorizontal}
          title="سیاست رزرو میز"
        />
      </div>

      <AdminDeskForm action={updateDeskSettingsAction} className="grid gap-6 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="حداکثر رزرو از قبل">
            <div className="flex h-10 overflow-hidden rounded-md border border-input bg-background transition focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
              <input
                className="min-w-0 flex-1 bg-transparent px-3 text-left text-sm outline-none"
                defaultValue={settings.maxAdvanceDays}
                max={365}
                min={1}
                name="maxAdvanceDays"
                required
                type="number"
              />
              <span className="inline-flex items-center border-r bg-slate-50 px-3 text-sm text-slate-500">
                روز
              </span>
            </div>
          </Field>
          <Field label="مهلت تأیید خودکار">
            <div className="flex h-10 overflow-hidden rounded-md border border-input bg-background transition focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
              <input
                className="min-w-0 flex-1 bg-transparent px-3 text-left text-sm outline-none"
                defaultValue={settings.autoApprovalDelayHours}
                max={24}
                min={1}
                name="autoApprovalDelayHours"
                required
                type="number"
              />
              <span className="inline-flex items-center border-r bg-slate-50 px-3 text-sm text-slate-500">
                ساعت
              </span>
            </div>
          </Field>
        </div>
        <ToggleSwitch
          defaultChecked={settings.autoApprovalEnabled}
          description="درخواست پس از مهلت تعیین‌شده، یا در زمان شروع رزرو اگر زودتر باشد، بررسی و در صورت نبود تداخل تأیید می‌شود."
          label="تأیید خودکار رزرو میز"
          name="autoApprovalEnabled"
        />
        <div className="flex justify-start border-t pt-5">
          <SubmitButton
            className="w-full sm:w-auto sm:min-w-40"
            pendingLabel="در حال ذخیره"
          >
            <Save className="h-4 w-4" />
            ذخیره سیاست رزرو
          </SubmitButton>
        </div>
      </AdminDeskForm>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Data fetching                                                      */
/* ------------------------------------------------------------------ */

type BuildingWithDetails = Awaited<
  ReturnType<typeof fetchBuildings>
>[0];

type BuildingPickerData = {
  id: string;
  name: string;
  active: boolean;
};

async function fetchBuildings() {
  return db.building.findMany({
    where: { deletedAt: null, isTransitional: false },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      desks: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      exceptions: { orderBy: { date: "desc" }, take: 20 },
      weeklySchedules: { orderBy: { dayOfWeek: "asc" } },
    },
  });
}

async function fetchSettings() {
  return db.deskSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", maxAdvanceDays: 14 },
  });
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default async function AdminDesksPage({ searchParams }: Props) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const [buildings, settings] = await Promise.all([fetchBuildings(), fetchSettings()]);
  const activeView = getView(params?.view);

  // For policy view, we don't need a building — it's global
  if (activeView === "policy") {
    return (
      <SpacesReservationSectionShell>
        <PageHeader
          subtitle="تنظیمات مشترک رزرو میز برای تمام ساختمان‌ها"
          title="سیاست رزرو میز"
        />
        <PolicyView settings={settings} />
      </SpacesReservationSectionShell>
    );
  }

  // Building-scoped views: find the building
  const building =
    buildings.find((item) => item.id === params?.buildingId) ?? buildings[0] ?? null;

  const buildingPickerData: BuildingPickerData[] = buildings.map((b) => ({
    id: b.id,
    name: b.name,
    active: b.active,
  }));

  const activeDeskCount =
    building?.desks.filter((desk) => desk.active).length ?? 0;
  const defaultDeskSortOrder =
    (building?.desks.reduce(
      (highest, desk) => Math.max(highest, desk.sortOrder),
      0,
    ) ?? 0) + 1;

  // No buildings at all
  if (!building) {
    return (
      <SpacesReservationSectionShell>
        <PageHeader
          subtitle="ابتدا یک ساختمان تعریف کنید."
          title="میزها"
        />
        <div className="grid justify-items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center shadow-sm">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <Building2 className="h-6 w-6" />
          </span>
          <div>
            <p className="font-medium text-slate-700">
              هنوز ساختمانی تعریف نشده است.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              برای مدیریت میزها، ابتدا باید یک ساختمان تعریف کنید.
            </p>
          </div>
        </div>
      </SpacesReservationSectionShell>
    );
  }

  return (
    <SpacesReservationSectionShell>
      <PageHeader
        subtitle="میزها، ساعات کاری و استثناهای رزرو هر ساختمان را مدیریت کنید."
        title="میزها"
      />

      <main className="grid min-w-0 gap-6">
        {activeView === "desks" ? (
          <DesksListView
            activeDeskCount={activeDeskCount}
            building={building}
            buildings={buildingPickerData}
            defaultDeskSortOrder={defaultDeskSortOrder}
          />
        ) : null}

        {activeView === "schedule" ? (
          <ScheduleView
            building={building}
            buildings={buildingPickerData}
          />
        ) : null}

        {activeView === "exceptions" ? (
          <ExceptionsView
            building={building}
            buildings={buildingPickerData}
          />
        ) : null}
      </main>
    </SpacesReservationSectionShell>
  );
}