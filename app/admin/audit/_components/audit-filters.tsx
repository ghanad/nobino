import Link from "next/link";
import type { ReactNode } from "react";
import { Filter, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { JALALI_DATE_INPUT_PLACEHOLDER } from "@/lib/jalali-date";

import {
  ACTION_LABELS,
  ENTITY_LABELS,
  type AuditSearchParams,
} from "./audit-helpers";

function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <label className="text-sm font-medium" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-right text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-right text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

type AuditFiltersProps = {
  actions: string[];
  actors: Array<{ id: string; name: string; email: string }>;
  entityTypes: string[];
  params: AuditSearchParams | undefined;
};

export function AuditFilters({
  actions,
  actors,
  entityTypes,
  params,
}: AuditFiltersProps) {
  return (
    <section
      className="rounded-lg border bg-card p-5 text-card-foreground"
      dir="rtl"
    >
      <div className="mb-4 flex flex-col gap-1 text-right sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">فیلتر گزارش</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            برای بررسی تغییرات یک کاربر، بخش یا بازه زمانی مشخص، فیلترها را
            محدود کنید.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          تاریخ‌ها را با تقویم جلالی وارد کنید.
        </span>
      </div>
      <form className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-2">
          <FieldLabel htmlFor="audit-actor">انجام‌دهنده</FieldLabel>
          <SelectInput
            defaultValue={params?.actorId ?? ""}
            id="audit-actor"
            name="actorId"
          >
            <option value="">همه کاربران</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name} ({actor.email})
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="grid gap-2">
          <FieldLabel htmlFor="audit-entity-type">بخش</FieldLabel>
          <SelectInput
            defaultValue={params?.entityType ?? ""}
            id="audit-entity-type"
            name="entityType"
          >
            <option value="">همه بخش‌ها</option>
            {entityTypes.map((entityType) => (
              <option key={entityType} value={entityType}>
                {ENTITY_LABELS[entityType] ?? entityType}
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="grid gap-2">
          <FieldLabel htmlFor="audit-action">نوع تغییر</FieldLabel>
          <SelectInput
            defaultValue={params?.action ?? ""}
            id="audit-action"
            name="action"
          >
            <option value="">همه تغییرات</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {ACTION_LABELS[action] ?? action}
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="grid gap-2">
          <FieldLabel htmlFor="audit-from">از تاریخ</FieldLabel>
          <TextInput
            defaultValue={params?.from ?? ""}
            id="audit-from"
            name="from"
            placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel htmlFor="audit-to">تا تاریخ</FieldLabel>
          <TextInput
            defaultValue={params?.to ?? ""}
            id="audit-to"
            name="to"
            placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
          />
        </div>

        <div className="flex items-end gap-2">
          <Button type="submit">
            <Filter className="h-4 w-4" />
            اعمال فیلتر
          </Button>
          <Button asChild type="button" variant="outline">
            <Link href="/admin/audit">
              <RotateCcw className="h-4 w-4" />
              پاک کردن
            </Link>
          </Button>
        </div>
      </form>
    </section>
  );
}
