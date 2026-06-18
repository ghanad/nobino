import { formatPersianNumber } from "./formatting";
import type { SlotReservationDetail } from "./types";

export function ReservationUserName({
  detail,
}: {
  detail: SlotReservationDetail;
}) {
  return (
    <span
      className="block min-h-0 max-h-full max-w-full overflow-hidden text-center text-sm font-semibold leading-5 [direction:ltr] [text-orientation:mixed] [writing-mode:vertical-rl]"
      title={`${detail.userName} - ${formatPersianNumber(detail.partySize)} نفر`}
    >
      {detail.userName}
    </span>
  );
}
