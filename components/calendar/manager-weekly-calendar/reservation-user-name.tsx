import { cn } from "@/lib/utils";

import type { SlotReservationDetail } from "./types";

export function ReservationUserName({
  detail,
  isDayFocused,
}: {
  detail: SlotReservationDetail;
  isDayFocused: boolean;
}) {
  return (
    <span
      className={cn(
        "block min-h-0 max-h-full max-w-full overflow-hidden text-center font-semibold",
        isDayFocused
          ? "w-full whitespace-nowrap text-[11px] leading-4 [direction:rtl]"
          : "text-sm leading-5 [direction:ltr] [text-orientation:mixed] [writing-mode:vertical-rl]",
      )}
      dir={isDayFocused ? "rtl" : undefined}
    >
      {detail.userName}
    </span>
  );
}
