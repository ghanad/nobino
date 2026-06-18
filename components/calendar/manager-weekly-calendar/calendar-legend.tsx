import { CapacityDot } from "./capacity-dots";
import { PendingRequestsBadge } from "./pending-requests-badge";

export function CalendarLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm"
      dir="rtl"
    >
      <span className="inline-flex items-center gap-1.5">
        <CapacityDot tone="free" />
        ظرفیت آزاد
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CapacityDot tone="approved" />
        رزرو تاییدشده
      </span>
      <span className="inline-flex items-center gap-1.5">
        <PendingRequestsBadge count={1} />
        درخواست در انتظار
      </span>
    </div>
  );
}
