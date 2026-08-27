import { UserRole } from "@prisma/client";
import {
  Building2,
  CalendarDays,
  Check,
  Clock3,
  LayoutGrid,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import Link from "next/link";
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
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
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

const days = [
  { dayOfWeek: 6, label: "شنبه" },
  { dayOfWeek: 0, label: "یکشنبه" },
  { dayOfWeek: 1, label: "دوشنبه" },
  { dayOfWeek: 2, label: "سه‌شنبه" },
  { dayOfWeek: 3, label: "چهارشنبه" },
  { dayOfWeek: 4, label: "پنجشنبه" },
  { dayOfWeek: 5, label: "جمعه" },
];

const inputClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-slate-900 outline-none ring-offset-background transition placeholder:text-slate-400 hover:border-slate-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring";
const panelClass = "overflow-hidden rounded-xl border bg-card shadow-sm";
const panelHeaderClass =
  "flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between";

function getView(value: string | undefined): DeskView {
  if (value === "schedule" || value === "exceptions" || value === "policy") {
    return value;
  }

  return "desks";
}

function getBuildingHref(buildingId: string, view: DeskView = "desks") {
  const query = new URLSearchParams({ buildingId });
  if (view !== "desks") query.set("view", view);
  return `/admin/desks?${query.toString()}`;
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
        <span className="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2" />
        <span className="pointer-events-none absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:-translate-x-5" />
      </span>
    </label>
  );
}

function BuildingNavigation({
  activeView,
  exceptionCount,
  buildingId,
}: {
  activeView: DeskView;
  exceptionCount: number;
  buildingId: string;
}) {
  const items: Array<{
    description: string;
    icon: ReactNode;
    label: string;
    view: DeskView;
  }> = [
    {
      description: "مشخصات ساختمان و فهرست میزها",
      icon: <LayoutGrid className="h-[18px] w-[18px]" />,
      label: "میزها",
      view: "desks",
    },
    {
      description: "روزها و ساعت‌های رزرو",
      icon: <Clock3 className="h-[18px] w-[18px]" />,
      label: "برنامه هفتگی",
      view: "schedule",
    },
    {
      description: `${exceptionCount} مورد ثبت‌شده`,
      icon: <CalendarDays className="h-[18px] w-[18px]" />,
      label: "استثناهای تقویم",
      view: "exceptions",
    },
    {
      description: "قواعد مشترک همه ساختمان‌ها",
      icon: <SlidersHorizontal className="h-[18px] w-[18px]" />,
      label: "سیاست رزرو",
      view: "policy",
    },
  ];

  return (
    <nav
      aria-label="بخش‌های مدیریت ساختمان"
      className="flex overflow-x-auto border-t bg-slate-50 px-2 pt-2 lg:grid lg:grid-cols-4"
    >
      {items.map((item) => {
        const isActive = item.view === activeView;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative grid min-w-[185px] flex-1 gap-1 rounded-t-lg px-4 py-3 text-right transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary lg:min-w-0",
              isActive
                ? "bg-white text-slate-950 shadow-sm after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 after:bg-primary"
                : "text-blue-800 hover:bg-blue-50/50 hover:text-blue-950",
            )}
            href={getBuildingHref(buildingId, item.view)}
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

export default async function AdminDesksPage({ searchParams }: Props) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const [buildings, settings] = await Promise.all([
    db.building.findMany({
      where: { deletedAt: null, isTransitional: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        desks: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        exceptions: { orderBy: { date: "desc" }, take: 20 },
        weeklySchedules: { orderBy: { dayOfWeek: "asc" } },
      },
    }),
    db.deskSettings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default", maxAdvanceDays: 14 },
    }),
  ]);
  const building =
    buildings.find((item) => item.id === params?.buildingId) ?? buildings[0] ?? null;
  const activeView = getView(params?.view);
  const totalActiveDeskCount = buildings.reduce(
    (count, item) => count + item.desks.filter((desk) => desk.active).length,
    0,
  );
  const activeDeskCount =
    building?.desks.filter((desk) => desk.active).length ?? 0;
  const defaultDeskSortOrder =
    (building?.desks.reduce(
      (highest, desk) => Math.max(highest, desk.sortOrder),
      0,
    ) ?? 0) + 1;
  return (
    <SpacesReservationSectionShell>
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill>{totalActiveDeskCount} میز فعال</StatusPill>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/buildings">
                <Building2 className="h-4 w-4" />
                ساختمان‌ها
              </Link>
            </Button>
          </div>
        }
        subtitle="یک ساختمان را انتخاب کنید و میزها، ساعات کاری و استثناهای رزرو آن را تنظیم کنید."
        title="میزها و زمان‌بندی"
      />

      <section className={cn(panelClass, "p-4")}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="grid min-w-fit gap-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">انتخاب ساختمان</h2>
              <StatusPill tone="muted">{buildings.length} ساختمان</StatusPill>
            </div>
            <p className="text-xs text-slate-600">
              تنظیمات هر ساختمان مستقل است.
            </p>
          </div>
          {buildings.length ? (
            <nav
              aria-label="ساختمان‌ها"
              className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-3"
            >
              {buildings.map((item) => {
                const isSelected = item.id === building?.id;
                const itemActiveDesks = item.desks.filter(
                  (desk) => desk.active,
                ).length;

                return (
                  <Link
                    aria-current={isSelected ? "page" : undefined}
                    className={cn(
                      "flex min-w-0 items-center gap-3 rounded-lg border px-3.5 py-3 text-right transition",
                      isSelected
                        ? "border-blue-300 bg-blue-50/70 ring-1 ring-blue-100"
                        : "bg-background hover:border-blue-200 hover:bg-blue-50/30",
                    )}
                    href={getBuildingHref(item.id, activeView)}
                    key={item.id}
                  >
                    <span
                      className={cn(
                        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        isSelected
                          ? "bg-primary text-white"
                          : "bg-slate-100 text-slate-600",
                      )}
                    >
                      <Building2 className="h-5 w-5" />
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-sm font-semibold">
                        {item.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {itemActiveDesks} میز فعال از {item.desks.length}
                      </span>
                    </span>
                    {isSelected ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>هنوز ساختمانی تعریف نشده است.</span>
              <Button asChild size="sm">
                <Link href="/admin/buildings">تعریف ساختمان</Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      {building ? (
        <main className="grid min-w-0 gap-6">
          <section className={cn(panelClass, "min-w-0")}>
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">{building.name}</h2>
                  <StatusPill tone={building.active ? "good" : "muted"}>
                    {building.active ? "فعال" : "غیرفعال"}
                  </StatusPill>
                </div>
                <p className="text-xs text-slate-600">
                  {activeDeskCount} میز فعال از {building.desks.length} میز
                </p>
              </div>
            </div>
            <BuildingNavigation
              activeView={activeView}
              exceptionCount={building.exceptions.length}
              buildingId={building.id}
            />
          </section>

          {activeView === "desks" ? (
            <>
              <section className={panelClass}>
                <div className={panelHeaderClass}>
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">میزهای ساختمان</h2>
                      <StatusPill tone="good">
                        {activeDeskCount} میز فعال
                      </StatusPill>
                      {building.desks.length - activeDeskCount > 0 ? (
                        <StatusPill tone="muted">
                          {building.desks.length - activeDeskCount} غیرفعال
                        </StatusPill>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-600">
                      تغییرات همه میزها با هم ذخیره می‌شوند؛ عدد کمتر، میز را
                      زودتر نمایش می‌دهد.
                    </p>
                  </div>
                </div>
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
                  <div className="grid gap-4 lg:grid-cols-2">
                    {building.desks.map((desk, index) => (
                      <div
                        className="grid gap-4 rounded-xl border bg-background p-4 transition hover:border-slate-300 hover:shadow-sm"
                        key={desk.id}
                      >
                        <input
                          name={`desks.${index}.deskId`}
                          type="hidden"
                          value={desk.id}
                        />
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                "h-2.5 w-2.5 shrink-0 rounded-full",
                                desk.active
                                  ? "bg-emerald-500"
                                  : "bg-slate-300",
                              )}
                            />
                            <strong className="truncate text-sm">
                              {desk.name}
                            </strong>
                          </div>
                          <StatusPill tone={desk.active ? "good" : "muted"}>
                            {desk.active ? "فعال" : "غیرفعال"}
                          </StatusPill>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
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
                              className={inputClass}
                              defaultValue={desk.sortOrder}
                              min={0}
                              name={`desks.${index}.sortOrder`}
                              type="number"
                            />
                          </Field>
                        </div>
                        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                            <input
                              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                              defaultChecked={desk.active}
                              name={`desks.${index}.active`}
                              type="checkbox"
                            />
                            قابل رزرو باشد
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 border-t bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
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

                <div className="grid gap-4 border-t p-5 lg:grid-cols-2">
                  <AdminDeskForm
                    action={createDeskAction}
                    className="grid gap-4 rounded-xl border border-dashed border-blue-300 bg-blue-50/30 p-4"
                    resetOnSuccess
                  >
                    <input name="buildingId" type="hidden" value={building.id} />
                    <div className="flex items-center gap-2 text-primary">
                      <Plus className="h-5 w-5" />
                      <h3 className="font-semibold">افزودن میز جدید</h3>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
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
                          className={inputClass}
                          defaultValue={defaultDeskSortOrder}
                          min={0}
                          name="sortOrder"
                          type="number"
                        />
                      </Field>
                    </div>
                    <div className="flex justify-start border-t border-blue-100 pt-4">
                      <SubmitButton
                        className="w-full sm:w-auto"
                        pendingLabel="در حال افزودن"
                        size="sm"
                      >
                        <Plus className="h-4 w-4" />
                        افزودن میز
                      </SubmitButton>
                    </div>
                  </AdminDeskForm>
                </div>
              </section>
            </>
          ) : null}

          {activeView === "schedule" ? (
            <section className={panelClass}>
              <div className={panelHeaderClass}>
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 h-5 w-5 text-primary" />
                  <div className="grid gap-1">
                    <h2 className="text-base font-semibold">برنامه هفتگی</h2>
                    <p className="text-xs text-slate-600">
                      ساعت‌ها باید روی ابتدای ساعت تنظیم شوند. پس از اعمال
                      تغییرات، برنامه هفتگی را ذخیره کنید.
                    </p>
                  </div>
                </div>
              </div>
              <AdminDeskForm
                action={updateBuildingScheduleAction}
                className="m-5 overflow-hidden rounded-xl border"
                trackChanges
              >
                <input name="buildingId" type="hidden" value={building.id} />
                {days.map(({ dayOfWeek, label }) => {
                    const schedule = building.weeklySchedules.find(
                      (item) => item.dayOfWeek === dayOfWeek,
                    );
                    const isWorkingDay = Boolean(schedule?.isWorkingDay);

                    return (
                      <div
                        className="grid gap-3 border-b bg-background px-4 py-3.5 hover:bg-slate-50/60 lg:grid-cols-[150px_170px_minmax(320px,1fr)] lg:items-start lg:gap-5"
                        key={dayOfWeek}
                      >
                      <input
                        name={`schedules.${dayOfWeek}.dayOfWeek`}
                        type="hidden"
                        value={dayOfWeek}
                      />
                      <div className="flex items-center gap-3 lg:mt-[26px]">
                        <span
                          className={cn(
                            "h-2.5 w-2.5 shrink-0 rounded-full",
                            isWorkingDay ? "bg-emerald-500" : "bg-slate-300",
                          )}
                        />
                        <span className="grid gap-0.5">
                          <strong className="text-sm">{label}</strong>
                          <span className="text-xs text-muted-foreground">
                            {isWorkingDay ? "روز کاری" : "تعطیل"}
                          </span>
                        </span>
                      </div>
                      <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg border bg-slate-50 px-3 text-sm font-medium text-slate-700 lg:mt-[26px]">
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
                            className={cn(inputClass, "h-10 text-left")}
                            defaultValue={schedule?.startTime ?? "09:00"}
                            name={`schedules.${dayOfWeek}.startTime`}
                            step={3600}
                            type="time"
                          />
                        </Field>
                        <Field label="پایان">
                          <input
                            className={cn(inputClass, "h-10 text-left")}
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
                <div className="flex flex-col gap-2 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
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
          ) : null}

          {activeView === "exceptions" ? (
            <section className={panelClass}>
              <div className={panelHeaderClass}>
                <div className="flex items-start gap-3">
                  <CalendarDays className="mt-0.5 h-5 w-5 text-primary" />
                  <div className="grid gap-1">
                    <h2 className="text-base font-semibold">
                      استثناهای تقویم
                    </h2>
                    <p className="text-xs text-slate-600">
                      برای تعطیلی یا ساعت کاری متفاوت در یک تاریخ مشخص استثنا
                      ثبت کنید.
                    </p>
                  </div>
                </div>
                <StatusPill tone="muted">
                  {building.exceptions.length} مورد
                </StatusPill>
              </div>
              <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
                <AdminDeskForm
                  action={upsertBuildingExceptionAction}
                  className="grid content-start gap-4 rounded-xl border bg-slate-50/60 p-4"
                  resetOnSuccess
                >
                  <input name="buildingId" type="hidden" value={building.id} />
                  <h3 className="font-semibold">ثبت استثنای جدید</h3>
                  <Field label="تاریخ">
                    <JalaliDatePicker
                      inputClassName="h-11"
                      name="date"
                      required
                    />
                  </Field>
                  <ToggleSwitch
                    description="اگر خاموش باشد، این تاریخ تعطیل ثبت می‌شود."
                    label="روز کاری باشد"
                    name="isWorkingDay"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="شروع">
                      <input
                        className={inputClass}
                        defaultValue="09:00"
                        name="startTime"
                        step={3600}
                        type="time"
                      />
                    </Field>
                    <Field label="پایان">
                      <input
                        className={inputClass}
                        defaultValue="17:00"
                        name="endTime"
                        step={3600}
                        type="time"
                      />
                    </Field>
                  </div>
                  <Field label="دلیل (اختیاری)">
                    <input
                      className={inputClass}
                      maxLength={200}
                      name="reason"
                      placeholder="مثلاً تعطیلی رسمی"
                    />
                  </Field>
                  <SubmitButton pendingLabel="در حال ذخیره">
                    <CalendarDays className="h-4 w-4" />
                    ثبت استثنا
                  </SubmitButton>
                </AdminDeskForm>

                <div className="grid content-start gap-3">
                  <h3 className="font-semibold">استثناهای ثبت‌شده</h3>
                  {building.exceptions.length ? (
                    building.exceptions.map((exception) => (
                      <div
                        className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
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
                            {exception.reason
                              ? ` · ${exception.reason}`
                              : ""}
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
                    ))
                  ) : (
                    <div className="grid justify-items-center gap-2 rounded-xl border border-dashed p-8 text-center">
                      <CalendarDays className="h-8 w-8 text-slate-300" />
                      <p className="text-sm text-muted-foreground">
                        هنوز استثنایی برای این ساختمان ثبت نشده است.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {activeView === "policy" ? (
            <section className={panelClass}>
              <div className={panelHeaderClass}>
                <div className="flex items-start gap-3">
                  <SlidersHorizontal className="mt-0.5 h-5 w-5 text-primary" />
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">
                        سیاست رزرو میز
                      </h2>
                      <StatusPill>مشترک بین همه ساختمان‌ها</StatusPill>
                    </div>
                    <p className="text-xs text-slate-600">
                      این تنظیمات روی درخواست رزرو میز در تمام ساختمان‌ها اعمال
                      می‌شود.
                    </p>
                  </div>
                </div>
              </div>
              <AdminDeskForm action={updateDeskSettingsAction} className="grid gap-6 p-5">
                <input name="buildingId" type="hidden" value={building.id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="حداکثر رزرو از قبل">
                    <div className="flex h-11 overflow-hidden rounded-md border border-input bg-background transition focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
                      <input
                        className="min-w-0 flex-1 bg-transparent px-3 text-left text-sm outline-none"
                        defaultValue={settings.maxAdvanceDays}
                        max={365}
                        min={1}
                        name="maxAdvanceDays"
                        required
                        type="number"
                      />
                      <span className="inline-flex items-center border-r bg-slate-50 px-4 text-sm text-slate-500">
                        روز
                      </span>
                    </div>
                  </Field>
                  <Field label="مهلت تأیید خودکار">
                    <div className="flex h-11 overflow-hidden rounded-md border border-input bg-background transition focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
                      <input
                        className="min-w-0 flex-1 bg-transparent px-3 text-left text-sm outline-none"
                        defaultValue={settings.autoApprovalDelayHours}
                        max={24}
                        min={1}
                        name="autoApprovalDelayHours"
                        required
                        type="number"
                      />
                      <span className="inline-flex items-center border-r bg-slate-50 px-4 text-sm text-slate-500">
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
          ) : null}

        </main>
      ) : null}
    </SpacesReservationSectionShell>
  );
}
