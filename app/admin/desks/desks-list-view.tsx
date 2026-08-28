"use client";

import {
  LayoutGrid,
  Plus,
  Save,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useState } from "react";

import {
  createDeskAction,
  updateBuildingDesksAction,
} from "@/app/admin/desks/actions";
import {
  AdminDeskForm,
  AdminDeskTrackedSubmitButton,
} from "@/app/admin/desks/admin-desk-form";
import { BuildingPicker } from "@/app/admin/desks/building-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

const inputClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-slate-900 outline-none ring-offset-background transition placeholder:text-slate-400 hover:border-slate-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring";

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
    <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

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

function AddDeskForm({
  buildingId,
  defaultDeskSortOrder,
  onCancel,
  onSuccess,
}: {
  buildingId: string;
  defaultDeskSortOrder: number;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [actionState, setActionState] = useState<{
    id?: string;
    message?: string;
    ok?: boolean;
  }>({});

  const handleAction = useCallback(
    async (formData: FormData) => {
      const result = await createDeskAction({}, formData);
      setActionState(result);
      if (result.ok) {
        router.refresh();
        onSuccess();
      }
    },
    [onSuccess, router],
  );

  return (
    <form
      action={handleAction}
      className="grid gap-3 rounded-lg border bg-slate-50/60 p-4 sm:grid-cols-[minmax(0,1fr)_100px_auto_auto] sm:items-end"
    >
      <input name="buildingId" type="hidden" value={buildingId} />
      <Field label="نام میز">
        <input
          autoFocus
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
      <SubmitButton pendingLabel="در حال افزودن" size="sm">
        <Plus className="h-4 w-4" />
        افزودن
      </SubmitButton>
      <button
        className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm text-slate-600 transition hover:bg-slate-100"
        onClick={onCancel}
        type="button"
      >
        <X className="h-4 w-4" />
        انصراف
      </button>
      {actionState.message ? (
        <p
          className={cn(
            "sm:col-span-full text-xs",
            actionState.ok ? "text-emerald-700" : "text-red-600",
          )}
        >
          {actionState.message}
        </p>
      ) : null}
    </form>
  );
}

export function DesksListView({
  activeDeskCount,
  building,
  buildings,
  defaultDeskSortOrder,
}: {
  activeDeskCount: number;
  building: {
    id: string;
    desks: Array<{
      id: string;
      name: string;
      active: boolean;
      sortOrder: number;
    }>;
  };
  buildings: Array<{
    id: string;
    name: string;
    active: boolean;
  }>;
  defaultDeskSortOrder: number;
}) {
  const hasDesks = building.desks.length > 0;
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAddSuccess = useCallback(() => {
    setShowAddForm(false);
  }, []);

  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", "min-w-0")}>
      <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <ViewPageHeader
          badge={
            hasDesks ? (
              <StatusPill tone="good">{activeDeskCount} میز فعال</StatusPill>
            ) : null
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
          className="grid gap-3 p-5"
          trackChanges
        >
          <input name="buildingId" type="hidden" value={building.id} />
          <input
            name="deskCount"
            type="hidden"
            value={building.desks.length}
          />

          <div className="grid gap-2">
            {building.desks.map((desk, index) => (
              <div
                className="grid gap-3 rounded-lg border bg-background px-4 py-3 transition hover:border-slate-300 sm:grid-cols-[minmax(0,1fr)_auto]"
                key={desk.id}
              >
                <input
                  name={`desks.${index}.deskId`}
                  type="hidden"
                  value={desk.id}
                />
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px] sm:items-end">
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
                <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:justify-center">
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

          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="grid justify-items-center gap-2 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-600">
            هنوز میزی برای این ساختمان تعریف نشده است.
          </p>
          {!showAddForm ? (
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              onClick={() => setShowAddForm(true)}
              type="button"
            >
              <Plus className="h-4 w-4" />
              افزودن میز
            </button>
          ) : null}
        </div>
      )}

      {/* Add desk section */}
      {hasDesks ? (
        <div className="border-t px-5 py-3">
          {!showAddForm ? (
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium text-slate-700 transition hover:border-primary/50 hover:text-primary"
              onClick={() => setShowAddForm(true)}
              type="button"
            >
              <Plus className="h-4 w-4" />
              افزودن میز
            </button>
          ) : (
            <AddDeskForm
              buildingId={building.id}
              defaultDeskSortOrder={defaultDeskSortOrder}
              onCancel={() => setShowAddForm(false)}
              onSuccess={handleAddSuccess}
            />
          )}
        </div>
      ) : showAddForm ? (
        <div className="border-t p-5">
          <AddDeskForm
            buildingId={building.id}
            defaultDeskSortOrder={defaultDeskSortOrder}
            onCancel={() => setShowAddForm(false)}
            onSuccess={handleAddSuccess}
          />
        </div>
      ) : null}
    </section>
  );
}