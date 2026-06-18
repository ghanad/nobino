export type SlotReservationDetail = {
  id: string;
  partySize: number;
  userName: string;
  status: "ALTERNATIVE_PROPOSED" | "APPROVED" | "PENDING";
  reason: string | null;
  href?: string;
};

export type ManagerWeekSlot = {
  slotStartHour: number;
  slotEndHour: number;
  approvedCount: number;
  pendingCount: number;
  capacity: number;
  details: SlotReservationDetail[];
};

export type ManagerWeekDay = {
  closedReason: string | null;
  dateLabel: string;
  dateParam: string;
  shortLabel: string;
  slots: ManagerWeekSlot[];
};

export type SlotReservationBlock = {
  detail: SlotReservationDetail;
  startHour: number;
  endHour: number;
};

export type PositionedReservationBlock = SlotReservationBlock & {
  lane: number;
  laneCount: number;
};

export type DraggedReservation = {
  durationHours: number;
  reservationId: string;
  status: SlotReservationDetail["status"];
};

export type ResizeEdge = "start" | "end";

export type ResizingReservation = {
  dateParam: string;
  edge: ResizeEdge;
  endHour: number;
  reservationId: string;
  startHour: number;
  status: SlotReservationDetail["status"];
};

export type SlotPointerTarget = {
  dateParam: string;
  slotEndHour: number;
  slotStartHour: number;
};

export type ManagerWeeklyCalendarProps = {
  currentDateParam: string;
  emptyMessage: string;
  nextWeekDateParam: string;
  previousWeekDateParam: string;
  todayDateParam: string;
  weekDays: ManagerWeekDay[];
  weekLabel: string;
};
