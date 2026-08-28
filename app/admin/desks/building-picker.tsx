"use client";

import { Building2, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type BuildingPickerProps = {
  buildings: Array<{
    id: string;
    name: string;
    active: boolean;
  }>;
  selectedBuildingId: string;
  view: "desks" | "schedule" | "exceptions";
};

export function BuildingPicker({
  buildings,
  selectedBuildingId,
  view,
}: BuildingPickerProps) {
  return (
    <form
      action="/admin/desks"
      className="w-full max-w-[260px]"
    >
      <input name="view" type="hidden" value={view} />
      <label className="sr-only" htmlFor="buildingId">
        ساختمان موردنظر
      </label>
      <div className="relative">
        <select
          className={cn(
            "h-9 w-full appearance-none rounded-md border border-input bg-background py-1.5 pr-3 pl-8 text-sm font-medium shadow-sm outline-none ring-offset-background transition-colors",
            "hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring",
          )}
          id="buildingId"
          name="buildingId"
          defaultValue={selectedBuildingId}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          <option disabled value="">
            یک ساختمان انتخاب کنید
          </option>
          {buildings.map((building) => (
            <option key={building.id} value={building.id}>
              {building.name}
              {building.active ? "" : " (غیرفعال)"}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Building2
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
        />
      </div>
    </form>
  );
}