"use client";

import { Building2, LayoutGrid, MoreHorizontal, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  createBuildingAction,
  deleteBuildingAction,
  updateBuildingAction,
} from "@/app/admin/desks/actions";
import { AdminDeskForm } from "@/app/admin/desks/admin-desk-form";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

const inputClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-slate-900 outline-none ring-offset-background transition placeholder:text-slate-400 hover:border-slate-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring";

function StatusPill({
  children,
  active = false,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-500",
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
  label,
  name,
}: {
  defaultChecked?: boolean;
  label: string;
  name: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border bg-slate-50/70 px-3.5 py-2.5 text-sm transition hover:border-blue-200">
      <span className="font-medium text-slate-800">{label}</span>
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
/*  Create section                                                     */
/* ------------------------------------------------------------------ */

export function CreateBuildingSection({ defaultSortOrder }: { defaultSortOrder: number }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 outline-none [&::-webkit-details-marker]:hidden">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Plus className="h-5 w-5" />
          </span>
          <div className="grid flex-1 gap-1">
            <span className="text-lg font-semibold">ساختمان جدید</span>
            <span className="text-xs text-muted-foreground">
              پس از ساخت، میزها و مجموعه‌های سیستم را به این ساختمان متصل کنید.
            </span>
          </div>
          <span className="hidden text-sm text-primary group-open:hidden sm:inline">
            کلیک برای باز کردن
          </span>
          <span className="hidden text-sm text-muted-foreground group-open:sm:inline">
            کلیک برای بستن
          </span>
        </summary>

        <AdminDeskForm
          action={createBuildingAction}
          className="grid gap-4 border-t px-5 pb-5 pt-4 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end"
          resetOnSuccess
        >
          <Field label="نام ساختمان">
            <input
              autoFocus
              className={inputClass}
              maxLength={100}
              name="name"
              placeholder="مثلاً ساختمان مرکزی"
              required
            />
          </Field>
          <Field label="ترتیب نمایش">
            <input
              className={inputClass}
              defaultValue={defaultSortOrder}
              min={0}
              name="sortOrder"
              required
              type="number"
            />
          </Field>
          <SubmitButton className="w-full md:w-auto" pendingLabel="در حال ایجاد">
            <Plus className="h-4 w-4" />
            ایجاد ساختمان
          </SubmitButton>
        </AdminDeskForm>
      </details>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Delete dialog                                                      */
/* ------------------------------------------------------------------ */

function DeleteBuildingDialog({
  buildingId,
  buildingName,
  isOpen,
  onClose,
}: {
  buildingId: string;
  buildingName: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");

  if (!isOpen) return null;

  return (
    <div
      aria-labelledby="delete-building-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6"
      dir="rtl"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className="w-full max-w-md rounded-xl border bg-background p-5 text-right shadow-xl">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">
            <Trash2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold" id="delete-building-title">
              حذف ساختمان
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              ساختمان «{buildingName}» و همه میزهای آن از دسترس خارج می‌شوند و
              رزروهای آینده حذف خواهند شد. سابقه رزروهای گذشته حفظ می‌شود.
            </p>
          </div>
          <Button
            aria-label="بستن"
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <AdminDeskForm action={deleteBuildingAction} className="mt-6 grid gap-4">
          <input name="buildingId" type="hidden" value={buildingId} />
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            برای تأیید، نام ساختمان را وارد کنید: <strong>{buildingName}</strong>
            <input
              autoComplete="off"
              className="h-11 rounded-md border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              onChange={(event) => setConfirmation(event.target.value)}
              value={confirmation}
            />
          </label>
          <div className="flex justify-start gap-2">
            <Button
              onClick={onClose}
              type="button"
              variant="outline"
            >
              انصراف
            </Button>
            <SubmitButton
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={confirmation.trim() !== buildingName}
              pendingLabel="در حال حذف"
            >
              حذف ساختمان
            </SubmitButton>
          </div>
        </AdminDeskForm>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Building row                                                       */
/* ------------------------------------------------------------------ */

function BuildingRow({
  building,
}: {
  building: {
    active: boolean;
    id: string;
    name: string;
    sortOrder: number;
    _count: {
      desks: number;
      lunchReservations: number;
      resourcePools: number;
    };
  };
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  return (
    <>
      <div className="group/building">
        {/* Collapsed row */}
        {!isEditing ? (
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Building2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-semibold">{building.name}</h3>
                  <StatusPill active={building.active}>
                    {building.active ? "فعال" : "غیرفعال"}
                  </StatusPill>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {building._count.desks} میز · {building._count.resourcePools} مجموعه سیستم · {building._count.lunchReservations} رزرو غذا
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/admin/desks?buildingId=${encodeURIComponent(building.id)}`}>
                  <LayoutGrid className="h-4 w-4" />
                  میزها و زمان‌بندی
                </Link>
              </Button>
              <Button
                onClick={() => setIsEditing(true)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Pencil className="h-4 w-4" />
                ویرایش
              </Button>
              <Button
                onClick={() => setIsDeleteOpen(true)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          /* Expanded edit area */
          <AdminDeskForm
            action={updateBuildingAction}
            className="grid gap-4 px-5 pb-5 pt-4 lg:grid-cols-[minmax(0,1fr)_160px_220px_auto] lg:items-end"
          >
            <input name="buildingId" type="hidden" value={building.id} />
            <Field label="نام ساختمان">
              <input
                className={inputClass}
                defaultValue={building.name}
                name="name"
                required
              />
            </Field>
            <Field label="ترتیب نمایش">
              <input
                className={inputClass}
                defaultValue={building.sortOrder}
                min={0}
                name="sortOrder"
                required
                type="number"
              />
            </Field>
            <ToggleSwitch
              defaultChecked={building.active}
              label="فعال بودن ساختمان"
              name="active"
            />
            <div className="flex items-center gap-2">
              <SubmitButton
                className="flex-1 lg:flex-none"
                pendingLabel="در حال ذخیره"
                size="sm"
              >
                <Save className="h-4 w-4" />
                ذخیره
              </SubmitButton>
              <Button
                onClick={() => setIsEditing(false)}
                size="sm"
                type="button"
                variant="outline"
              >
                انصراف
              </Button>
            </div>
          </AdminDeskForm>
        )}
      </div>

      <DeleteBuildingDialog
        buildingId={building.id}
        buildingName={building.name}
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Building list                                                      */
/* ------------------------------------------------------------------ */

export function BuildingList({
  buildings,
}: {
  buildings: Array<{
    active: boolean;
    id: string;
    name: string;
    sortOrder: number;
    _count: {
      desks: number;
      lunchReservations: number;
      resourcePools: number;
    };
  }>;
}) {
  return (
    <div className="divide-y">
      {buildings.map((building) => (
        <BuildingRow building={building} key={building.id} />
      ))}
    </div>
  );
}