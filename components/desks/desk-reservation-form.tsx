"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Clock3, MapPin, Pencil } from "lucide-react";

import {
  cancelOwnDeskReservationAction,
  createDeskReservationAction,
  updateOwnDeskReservationAction,
} from "@/app/desks/actions";
import { Button } from "@/components/ui/button";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { buildDeskLayout } from "@/lib/desk-layout";
import { cn } from "@/lib/utils";

type DeskOption = { active: boolean; id: string; name: string };
type OfficeOption = { id: string; name: string };
type DeskReservation = {
  deskId: string;
  endHour: number;
  id: string;
  startHour: number;
  status: "APPROVED" | "PENDING";
  userId: string;
  userName: string;
};
type IntervalState =
  | "available"
  | "currentApproved"
  | "currentPending"
  | "inactive"
  | "pendingOther"
  | "reservedOther";

type DeskReservationFormProps = {
  currentUserId: string;
  date: string;
  dateLabel: string;
  defaultEndHour: number;
  defaultStartHour: number;
  desks: DeskOption[];
  hours: number[];
  isFullDay: boolean;
  isStarted: boolean;
  myReservation?: DeskReservation;
  officeId: string;
  officeName: string;
  offices: OfficeOption[];
  reservations: DeskReservation[];
};

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const inputClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`.replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

function overlaps(reservation: DeskReservation, startHour: number, endHour: number) {
  return reservation.endHour > startHour && reservation.startHour < endHour;
}

function statusLabel(status: DeskReservation["status"]) {
  return status === "APPROVED" ? "تأیید شده" : "در انتظار تأیید";
}

function getIntervalState(
  relevant: DeskReservation | undefined,
  currentUserId: string,
): IntervalState {
  if (!relevant) return "available";
  if (relevant.userId === currentUserId) {
    return relevant.status === "APPROVED" ? "currentApproved" : "currentPending";
  }
  return relevant.status === "APPROVED" ? "reservedOther" : "pendingOther";
}

function stateLabel(state: IntervalState) {
  switch (state) {
    case "currentApproved": return "رزرو تأییدشده شما";
    case "currentPending": return "رزرو شما در انتظار تأیید";
    case "inactive": return "غیرفعال و غیرقابل انتخاب";
    case "pendingOther": return "درخواست در انتظار؛ قابل انتخاب";
    case "reservedOther": return "در این بازه رزرو شده";
    default: return "آزاد در بازه شما";
  }
}

export function DeskReservationForm({
  currentUserId,
  date,
  dateLabel,
  defaultEndHour,
  defaultStartHour,
  desks,
  hours,
  isFullDay,
  isStarted,
  myReservation,
  officeId,
  officeName,
  offices,
  reservations,
}: DeskReservationFormProps) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const [editingTime, setEditingTime] = useState(!myReservation);
  const [fullDay, setFullDay] = useState(isFullDay && !isStarted);
  const [startHour, setStartHour] = useState(defaultStartHour);
  const [endHour, setEndHour] = useState(defaultEndHour);
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(
    myReservation && desks.some((desk) => desk.id === myReservation.deskId && desk.active)
      ? myReservation.deskId
      : null,
  );
  const firstHour = hours[0] ?? defaultStartHour;
  const lastHour = hours.at(-1) ?? defaultEndHour;
  const displayedStart = fullDay ? firstHour : startHour;
  const displayedEnd = fullDay ? lastHour : endHour;
  const layout = useMemo(() => buildDeskLayout(desks.map((desk) => desk.id)), [desks]);

  const deskStates = useMemo(() => desks.map((desk) => {
    const deskReservations = reservations.filter((item) => item.deskId === desk.id);
    const overlapping = deskReservations.filter((item) => overlaps(item, displayedStart, displayedEnd));
    const relevant = overlapping.find(
      (item) => item.status === "APPROVED" && item.userId !== currentUserId,
    ) ?? overlapping.find((item) => item.userId === currentUserId)
      ?? overlapping.find((item) => item.status === "APPROVED")
      ?? overlapping[0];
    const state = desk.active ? getIntervalState(relevant, currentUserId) : "inactive";
    return {
      desk,
      relevant,
      state,
    };
  }), [currentUserId, desks, displayedEnd, displayedStart, reservations]);

  const selectedDeskState = deskStates.find((item) => item.desk.id === selectedDeskId) ?? null;
  const selectedDesk = selectedDeskState?.desk ?? null;
  const selectedReservations = reservations.filter((item) => item.deskId === selectedDeskId);
  const approvedConflict = selectedReservations.find(
    (item) => item.status === "APPROVED" && item.id !== myReservation?.id && overlaps(item, displayedStart, displayedEnd),
  );
  const movingDesk = Boolean(myReservation && selectedDeskId && selectedDeskId !== myReservation.deskId);
  const timeChanged = Boolean(myReservation && (
    displayedStart !== myReservation.startHour || displayedEnd !== myReservation.endHour
  ));
  const hasChanges = movingDesk || timeChanged;
  const canSubmit = Boolean(selectedDesk?.active && !approvedConflict && (!myReservation || (movingDesk ? true : editingTime && hasChanges)));
  const availableCount = deskStates.filter((item) => item.state === "available" || item.state === "pendingOther").length;

  function navigate(nextOfficeId: string, nextDate: string) {
    const query = new URLSearchParams({ date: nextDate, officeId: nextOfficeId });
    startNavigation(() => router.replace(`/desks?${query.toString()}`));
  }

  function chooseAvailableSegment(segmentStart: number, segmentEnd: number) {
    if (isStarted) return;
    setEditingTime(true);
    setFullDay(false);
    setStartHour(segmentStart);
    setEndHour(segmentEnd);
  }

  const timelineSegments = selectedDesk ? (() => {
    const boundaries = Array.from(new Set([
      firstHour,
      lastHour,
      ...selectedReservations.flatMap((item) => [
        Math.max(firstHour, item.startHour),
        Math.min(lastHour, item.endHour),
      ]),
    ])).filter((hour) => hour >= firstHour && hour <= lastHour).sort((a, b) => a - b);
    return boundaries.slice(0, -1).map((segmentStart, index) => {
      const segmentEnd = boundaries[index + 1];
      const candidates = selectedReservations.filter((item) => overlaps(item, segmentStart, segmentEnd));
      const occupied = candidates.find((item) => item.status === "APPROVED")
        ?? candidates.find((item) => item.userId === currentUserId)
        ?? candidates[0];
      return { end: segmentEnd, occupied, start: segmentStart };
    });
  })() : [];

  const actionLabel = selectedDesk ? !myReservation
    ? `رزرو ${selectedDesk.name}`
    : movingDesk
      ? `انتقال رزرو به ${selectedDesk.name}`
      : "ذخیره تغییرات زمان"
    : "یک میز انتخاب کنید";

  return (
    <form action={myReservation ? updateOwnDeskReservationAction : createDeskReservationAction} className="grid gap-4">
      <input name="date" type="hidden" value={date} />
      <input name="officeId" type="hidden" value={officeId} />
      <input name="deskId" type="hidden" value={selectedDeskId ?? ""} />
      {myReservation ? <input name="reservationId" type="hidden" value={myReservation.id} /> : null}
      {fullDay ? <input name="fullDay" type="hidden" value="on" /> : null}

      <section className="rounded-xl border bg-card px-4 py-2.5 shadow-sm">
        <div className="grid items-end gap-2.5 sm:grid-cols-2 lg:grid-cols-[1fr_1.15fr_1.25fr_.8fr_.8fr]">
          <label className="grid gap-1 text-xs font-medium text-slate-600">دفتر
            <select className={inputClass} disabled={isNavigating} onChange={(event) => navigate(event.target.value, date)} value={officeId}>
              {offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">تاریخ
            <JalaliDatePicker disabled={isNavigating} name="filterDate" onValueChange={(value) => value && navigate(officeId, value)} required value={date} />
          </label>
          <fieldset className="grid gap-1 sm:col-span-2 lg:col-span-1">
            <legend className="text-xs font-medium text-slate-600">مدت حضور</legend>
            <div className="grid grid-cols-2 rounded-md bg-slate-100 p-0.5 text-xs">
              <button className={cn("h-9 rounded font-medium", !fullDay ? "bg-white text-slate-950 shadow-sm" : "text-slate-600")} onClick={() => setFullDay(false)} type="button">ساعتی</button>
              <button className={cn("h-9 rounded font-medium disabled:opacity-50", fullDay ? "bg-white text-slate-950 shadow-sm" : "text-slate-600")} disabled={isStarted} onClick={() => setFullDay(true)} type="button">کل روز کاری</button>
            </div>
          </fieldset>
          {!fullDay ? <>
            <label className="grid gap-1 text-xs font-medium text-slate-600">شروع
              <select className={inputClass} disabled={isStarted} name="startHour" onChange={(event) => { const next = Number(event.target.value); setStartHour(next); if (endHour <= next) setEndHour(next + 1); }} value={startHour}>
                {hours.slice(0, -1).map((hour) => <option key={hour} value={hour}>{formatHour(hour)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">پایان
              <select className={inputClass} name="endHour" onChange={(event) => setEndHour(Number(event.target.value))} value={endHour}>
                {hours.slice(1).filter((hour) => hour > startHour).map((hour) => <option key={hour} value={hour}>{formatHour(hour)}</option>)}
              </select>
            </label>
            {isStarted ? <input name="startHour" type="hidden" value={displayedStart} /> : null}
          </> : <>
            <input name="startHour" type="hidden" value={firstHour} />
            <input name="endHour" type="hidden" value={lastHour} />
            <div className="flex h-10 items-center gap-2 rounded-md bg-blue-50 px-3 text-xs text-blue-900 sm:col-span-2"><Clock3 className="h-4 w-4" />{formatHour(firstHour)} تا {formatHour(lastHour)}</div>
          </>}
        </div>
        <div className="mt-1.5 flex flex-col gap-1.5 border-t pt-1.5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span className="text-slate-500">بازه انتخابی: <strong className="text-slate-800">{formatHour(displayedStart)} تا {formatHour(displayedEnd)}</strong></span>
          {myReservation ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">
            <span><strong className="text-blue-900">رزرو شما:</strong> {desks.find((desk) => desk.id === myReservation.deskId)?.name}، {formatHour(myReservation.startHour)} تا {formatHour(myReservation.endHour)} · {statusLabel(myReservation.status)}</span>
            <Button className="h-8 px-2.5" disabled={!desks.some((desk) => desk.id === myReservation.deskId && desk.active)} onClick={() => { setEditingTime(true); setSelectedDeskId(myReservation.deskId); }} type="button" variant="outline"><Pencil className="h-3.5 w-3.5" />ویرایش زمان</Button>
            <SubmitButton className="h-8 px-2.5 text-red-600 hover:bg-red-50 hover:text-red-700" formAction={cancelOwnDeskReservationAction} pendingLabel="در حال لغو" variant="ghost">لغو رزرو</SubmitButton>
          </div> : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm" aria-label="فضای رزرو میز">
        <header className="grid gap-1.5 border-b px-4 py-2.5 sm:px-5">
          <div><h2 className="font-semibold text-slate-950">نقشه میزها</h2><p className="mt-0.5 text-xs text-muted-foreground"><strong className="text-emerald-700">{availableCount.toLocaleString("fa-IR")} میز</strong> برای بازه {formatHour(displayedStart)} تا {formatHour(displayedEnd)} در دسترس است.</p></div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-600" aria-label="راهنمای نقشه و وضعیت میزها"><span className="text-emerald-700">● آزاد</span><span aria-hidden="true" className="text-slate-300">·</span><span className="text-red-700">● رزرو شده</span><span aria-hidden="true" className="text-slate-300">·</span><span className="text-amber-700">◌ در انتظار تأیید</span><span aria-hidden="true" className="text-slate-300">·</span><span className="text-blue-700">◆ رزرو شما</span><span aria-hidden="true" className="text-slate-300">·</span><span className="text-slate-500">● غیرفعال</span><span aria-hidden="true" className="text-slate-300">·</span><span className="font-medium text-purple-700">❄ کولر گازی</span></div>
        </header>

        <div className={cn("grid items-stretch", selectedDesk ? "lg:grid-cols-[minmax(0,2fr)_minmax(19rem,1fr)]" : "lg:grid-cols-[minmax(0,3fr)_minmax(14rem,.7fr)]")}>
          <div className="overflow-x-auto bg-slate-50/50 p-3" aria-label="نقشه میزهای دفتر">
            <div className="relative mx-auto aspect-[17/28] min-w-[340px] max-w-md rounded-sm border-2 border-slate-700 bg-white shadow-inner" role="listbox" aria-label="انتخاب میز">
              <div aria-label="پنل کولر گازی روی دیوار بالایی" className="absolute left-[47%] top-0 z-10 flex h-[3%] w-[18%] -translate-y-1/2 items-center justify-center gap-1 rounded border-2 border-purple-500 bg-gradient-to-b from-purple-100 to-purple-200 text-[8px] font-semibold text-purple-900 shadow-sm" role="img"><span aria-hidden="true">❄</span><span>کولر</span></div>
              <div aria-hidden="true" className="absolute left-0 top-[18.5%] w-[48%] border-t-2 border-slate-700" />
              <div aria-hidden="true" className="absolute right-0 top-[18.5%] w-[26%] border-t-2 border-slate-700" />
              <div aria-hidden="true" className="absolute left-0 top-[42%] h-[16%] w-[48%] border-b-2 border-r-2 border-t-2 border-slate-700" />
              <div aria-label="پنل کولر گازی روی دیوار داخلی" className="absolute left-[48%] top-[45%] z-10 flex h-[10%] w-[3%] -translate-x-1/2 items-center justify-center rounded border-2 border-purple-500 bg-gradient-to-r from-purple-100 to-purple-200 text-[9px] text-purple-900 shadow-sm" role="img"><span aria-hidden="true">❄</span></div>
              <div aria-hidden="true" className="absolute left-[-2px] top-[19%] flex h-[8%] w-6 -translate-x-1/2 items-center justify-center rounded border-2 border-amber-300 bg-amber-100 text-[9px] font-semibold text-amber-950 [writing-mode:vertical-rl]">درب</div>
              <div aria-hidden="true" className="absolute bottom-[3%] left-[-2px] flex h-[8%] w-6 -translate-x-1/2 items-center justify-center rounded border-2 border-amber-300 bg-amber-100 text-[9px] font-semibold text-amber-950 [writing-mode:vertical-rl]">درب</div>
              <div aria-hidden="true" className="absolute right-[2%] top-[47%] flex h-[12%] w-[6%] items-center justify-center rounded-lg border-2 border-emerald-300 bg-emerald-100 text-[11px] font-semibold text-emerald-900 [writing-mode:vertical-rl]">مبل</div>
              {deskStates.map(({ desk, relevant, state }) => {
                const isCurrentDesk = myReservation?.deskId === desk.id;
                const isSelected = selectedDeskId === desk.id;
                const placement = layout[desk.id];
                return <div className={cn("absolute", placement?.deskClass)} key={desk.id}>
                  <button
                    aria-label={`${desk.name}، ${stateLabel(state)}${isSelected ? "، انتخاب‌شده" : ""}`}
                    aria-disabled={!desk.active}
                    aria-selected={isSelected}
                    className={cn(
                      "relative flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-md border-2 bg-white p-0.5 text-center transition focus-visible:ring-2 focus-visible:ring-ring",
                      state === "inactive" && "cursor-not-allowed border-slate-300 bg-slate-200 text-slate-500 opacity-80",
                      state === "reservedOther" && "border-red-200 bg-red-50/60",
                      state === "pendingOther" && "border-amber-200 bg-amber-50/60",
                      (state === "currentPending" || state === "currentApproved" || (isCurrentDesk && desk.active)) && "border-blue-200 bg-blue-50/70",
                      isSelected && !isCurrentDesk && "border-slate-700 ring-2 ring-slate-700/10",
                      isSelected && isCurrentDesk && "ring-2 ring-blue-400/30",
                    )}
                    disabled={!desk.active}
                    onClick={() => setSelectedDeskId(desk.id)}
                    role="option"
                    title={!desk.active ? `${desk.name} غیرفعال و غیرقابل انتخاب است` : relevant ? `${relevant.userName}، ${formatHour(relevant.startHour)} تا ${formatHour(relevant.endHour)}، ${statusLabel(relevant.status)}` : `${desk.name} برای این بازه آزاد است`}
                    type="button"
                  >
                    <span className="text-[9px] font-semibold leading-3">{desk.name}</span>
                    <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", state === "inactive" ? "bg-slate-400" : state === "reservedOther" ? "bg-red-500" : state === "pendingOther" || state === "currentPending" ? "bg-amber-500" : state === "currentApproved" ? "bg-blue-500" : "bg-emerald-500")} />
                  </button>
                </div>;
              })}
            </div>
          </div>

          <aside className="border-t bg-white lg:border-r lg:border-t-0">
            {!selectedDesk || !selectedDeskState ? <div className="flex min-h-24 items-center gap-2.5 p-4 text-xs leading-5 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0 text-primary" />برای مشاهده برنامه روز، یک میز را انتخاب کنید.</div> : <div className="grid gap-4 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{selectedDesk.name}</h3><p className="mt-0.5 text-xs text-muted-foreground">{officeName} · {dateLabel}</p></div><span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", selectedDeskState.state === "inactive" ? "bg-slate-100 text-slate-600" : selectedDeskState.state === "reservedOther" ? "bg-red-50 text-red-700" : selectedDeskState.state === "pendingOther" || selectedDeskState.state === "currentPending" ? "bg-amber-50 text-amber-800" : selectedDeskState.state === "currentApproved" ? "bg-blue-50 text-blue-800" : "bg-emerald-50 text-emerald-700")}>{stateLabel(selectedDeskState.state)}</span></div>

              <section className="grid gap-2.5" aria-label={`برنامه روزانه ${selectedDesk.name}`}>
                <div className="flex items-center gap-2 text-xs font-semibold"><CalendarDays className="h-4 w-4 text-primary" />برنامه کامل روز</div>
                <div className="flex justify-between text-[9px] text-slate-500" dir="ltr">{hours.map((hour) => <span key={hour}>{formatHour(hour)}</span>)}</div>
                <div className="flex h-10 overflow-hidden rounded-md border" dir="ltr">
                  {timelineSegments.map((segment) => {
                    const segmentState = getIntervalState(segment.occupied, currentUserId);
                    return <button
                      aria-label={segment.occupied ? `${segment.occupied.userName}، ${formatHour(segment.start)} تا ${formatHour(segment.end)}، ${statusLabel(segment.occupied.status)}` : `آزاد، ${formatHour(segment.start)} تا ${formatHour(segment.end)}`}
                      className={cn("min-w-0 border-r px-1 text-[9px] font-medium first:border-r-0", segmentState === "available" ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : segmentState === "pendingOther" || segmentState === "currentPending" ? "bg-amber-50 text-amber-900" : segmentState === "currentApproved" ? "bg-blue-100 text-blue-900" : "bg-red-50 text-red-800")}
                      key={`${segment.start}-${segment.end}`}
                      onClick={() => !segment.occupied && chooseAvailableSegment(segment.start, segment.end)}
                      style={{ width: `${((segment.end - segment.start) / (lastHour - firstHour)) * 100}%` }}
                      title={segment.occupied ? `${segment.occupied.userName}، ${formatHour(segment.start)} تا ${formatHour(segment.end)}، ${statusLabel(segment.occupied.status)}` : `آزاد، ${formatHour(segment.start)} تا ${formatHour(segment.end)}`}
                      type="button"
                    >{segment.occupied ? segment.occupied.userId === currentUserId ? "رزرو شما" : segment.occupied.userName : "آزاد"}</button>;
                  })}
                </div>
              </section>

              <section className="grid gap-2 border-t pt-3">
                {movingDesk && myReservation ? <p className="text-xs text-slate-600">انتقال رزرو از <strong>{desks.find((desk) => desk.id === myReservation.deskId)?.name}</strong> به <strong>{selectedDesk.name}</strong> برای {formatHour(displayedStart)} تا {formatHour(displayedEnd)}</p> : <p className="text-xs text-slate-600">{selectedDesk.name} · {formatHour(displayedStart)} تا {formatHour(displayedEnd)}</p>}
                {approvedConflict ? <p className="rounded-md bg-red-50 p-2.5 text-xs text-red-700">این بازه با رزرو {approvedConflict.userName} از {formatHour(approvedConflict.startHour)} تا {formatHour(approvedConflict.endHour)} هم‌پوشانی دارد.</p> : null}
                {!myReservation ? <SubmitButton className="w-full" disabled={!canSubmit} pendingLabel="در حال ثبت"><Check className="h-4 w-4" />{actionLabel}</SubmitButton> : movingDesk ? <SubmitButton className="w-full" disabled={!canSubmit} pendingLabel="در حال انتقال"><Check className="h-4 w-4" />{actionLabel}</SubmitButton> : editingTime ? <div className="grid gap-2"><SubmitButton className="w-full" disabled={!canSubmit} pendingLabel="در حال ذخیره"><Check className="h-4 w-4" />{actionLabel}</SubmitButton>{!hasChanges ? <p className="text-center text-[11px] text-muted-foreground">برای ذخیره، بازه زمانی را تغییر دهید.</p> : null}<Button onClick={() => { setEditingTime(false); setStartHour(myReservation.startHour); setEndHour(myReservation.endHour); setFullDay(isFullDay); }} type="button" variant="ghost">انصراف از ویرایش</Button></div> : <Button onClick={() => setEditingTime(true)} type="button"><Pencil className="h-4 w-4" />ویرایش زمان رزرو</Button>}
              </section>
            </div>}
          </aside>
        </div>
      </section>
    </form>
  );
}
