import { Hourglass } from "lucide-react";

import { cn } from "@/lib/utils";

import { formatPersianNumber } from "./formatting";

export function PendingRequestsBadge({
  className,
  count,
}: {
  className?: string;
  count: number;
}) {
  if (count <= 0) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center gap-0.5 rounded-full border border-amber-300 bg-amber-100 px-1.5 text-[10px] font-semibold leading-none text-amber-800 shadow-sm",
        className,
      )}
    >
      <Hourglass className="h-3 w-3" />
      <span>{formatPersianNumber(count)}</span>
    </span>
  );
}
