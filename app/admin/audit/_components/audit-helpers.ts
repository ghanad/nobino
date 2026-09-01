import type { Prisma } from "@prisma/client";

import {
  formatJalaliDateTime,
  parseJalaliDateParam,
} from "@/lib/jalali-date";

export type AuditSearchParams = {
  action?: string;
  actorId?: string;
  entityType?: string;
  from?: string;
  page?: string;
  to?: string;
};

export type AuditLogRow = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  oldValue: Prisma.JsonValue | null;
  newValue: Prisma.JsonValue | null;
  createdAt: Date;
  actor: {
    id: string;
    name: string;
    email: string;
  } | null;
};

type AuditJsonRecord = Record<string, Prisma.JsonValue>;

export const ACTION_LABELS: Record<string, string> = {
  CALENDAR_DAY_OVERRIDE_CREATED: "اصلاح تقویم عملیاتی ثبت شد",
  CALENDAR_DAY_OVERRIDE_DELETED: "اصلاح تقویم عملیاتی حذف شد",
  CALENDAR_DAY_OVERRIDE_UPDATED: "اصلاح تقویم عملیاتی ویرایش شد",
  DESK_CREATED: "میز ساخته شد",
  DESK_UPDATED: "میز ویرایش شد",
  DESK_RESERVATION_CREATED: "درخواست رزرو میز ثبت شد",
  DESK_RESERVATION_AUTO_APPROVED: "رزرو میز خودکار تأیید شد",
  DESK_RESERVATION_AUTO_REJECTED_CONFLICT:
    "درخواست رزرو میز به‌دلیل تداخل خودکار رد شد",
  DESK_RESERVATION_APPROVED: "رزرو میز توسط مدیر تأیید شد",
  DESK_RESERVATION_REJECTED: "درخواست رزرو میز رد شد",
  DESK_RESERVATION_UPDATED: "رزرو میز ویرایش شد",
  DESK_RESERVATION_CANCELLED_BY_MANAGER: "رزرو میز توسط مدیر لغو شد",
  DESK_RESERVATION_CANCELLED_BY_USER: "رزرو میز توسط کاربر لغو شد",
  DESK_SETTINGS_UPDATED: "سیاست رزرو میز تغییر کرد",
  OFFICE_CREATED: "ساختمان ساخته شد",
  OFFICE_DELETED: "ساختمان حذف شد",
  OFFICE_UPDATED: "ساختمان ویرایش شد",
  OFFICE_SCHEDULE_UPDATED: "برنامه هفتگی ساختمان تغییر کرد",
  OFFICE_EXCEPTION_CREATED: "استثنای ساختمان اضافه شد",
  OFFICE_EXCEPTION_UPDATED: "استثنای ساختمان ویرایش شد",
  OFFICE_EXCEPTION_DELETED: "استثنای ساختمان حذف شد",
  BUILDING_CREATED: "ساختمان ساخته شد",
  BUILDING_DELETED: "ساختمان حذف شد",
  BUILDING_UPDATED: "ساختمان ویرایش شد",
  BUILDING_SCHEDULE_UPDATED: "برنامه هفتگی ساختمان تغییر کرد",
  BUILDING_EXCEPTION_CREATED: "استثنای ساختمان اضافه شد",
  BUILDING_EXCEPTION_UPDATED: "استثنای ساختمان ویرایش شد",
  BUILDING_EXCEPTION_DELETED: "استثنای ساختمان حذف شد",
  ALTERNATIVE_ACCEPTED: "پیشنهاد جایگزین پذیرفته شد",
  ALTERNATIVE_PROPOSED: "زمان جایگزین پیشنهاد شد",
  ALTERNATIVE_REJECTED: "پیشنهاد جایگزین رد شد",
  BALE_LUNCH_REPORT_RECIPIENT_CREATED: "گیرنده گزارش غذا اضافه شد",
  BALE_LUNCH_REPORT_RECIPIENT_DELETED: "گیرنده گزارش غذا حذف شد",
  BALE_LUNCH_REPORT_RECIPIENT_UPDATED: "گیرنده گزارش غذا ویرایش شد",
  BALE_LUNCH_REPORT_SETTINGS_CHANGED: "تنظیمات محتوای گزارش غذا تغییر کرد",
  FOOD_RESERVATION_CANCELLED_BY_MANAGER: "رزرو غذا توسط مدیر لغو شد",
  FOOD_RESERVATION_CANCELLED_BY_USER: "رزرو غذا توسط کاربر لغو شد",
  FOOD_RESERVATION_CANCELLED_WITH_SYSTEM_RESERVATION:
    "رزرو غذا همراه رزرو سیستم لغو شد",
  FOOD_RESERVATION_CREATED: "رزرو غذا ثبت شد",
  FOOD_RESERVATION_UPDATED: "رزرو غذا تغییر کرد",
  IRAN_HOLIDAY_SYNC_FAILED: "همگام‌سازی خودکار تعطیلات ناموفق بود",
  IRAN_HOLIDAY_SYNC_STARTED: "همگام‌سازی خودکار تعطیلات آغاز شد",
  IRAN_HOLIDAY_SYNC_SUCCEEDED: "همگام‌سازی خودکار تعطیلات انجام شد",
  CAPACITY_CHANGED: "ظرفیت تغییر کرد",
  RESOURCE_POOL_BUILDING_ASSIGNED: "ساختمان مخزن ظرفیت تعیین شد",
  CAPACITY_EXCEPTION_CREATED: "استثنای ظرفیت اضافه شد",
  CAPACITY_EXCEPTION_DELETED: "استثنای ظرفیت حذف شد",
  CAPACITY_EXCEPTION_UPDATED: "استثنای ظرفیت ویرایش شد",
  LUNCH_RESERVATION_CANCELLED_BY_MANAGER: "رزرو غذا توسط مدیر لغو شد",
  LUNCH_RESERVATION_CANCELLED_BY_USER: "رزرو غذا توسط کاربر لغو شد",
  LUNCH_RESERVATION_CREATED: "رزرو غذا ثبت شد",
  LUNCH_RESERVATION_UPDATED: "رزرو غذا تغییر کرد",
  MEETING_ROOM_ACTIVE_STATUS_CHANGED: "وضعیت اتاق جلسه تغییر کرد",
  MEETING_ROOM_CREATED: "اتاق جلسه ساخته شد",
  MEETING_ROOM_DELETED: "اتاق جلسه حذف شد",
  MEETING_ROOM_EXCEPTION_CREATED: "استثنای اتاق جلسه اضافه شد",
  MEETING_ROOM_EXCEPTION_DELETED: "استثنای اتاق جلسه حذف شد",
  MEETING_ROOM_EXCEPTION_UPDATED: "استثنای اتاق جلسه ویرایش شد",
  MEETING_ROOM_RESERVATION_APPROVED: "رزرو اتاق جلسه تایید شد",
  MEETING_ROOM_RESERVATION_AUTO_APPROVED:
    "رزرو اتاق جلسه به‌صورت خودکار تایید شد",
  MEETING_ROOM_RESERVATION_CANCELLED_BY_MANAGER:
    "رزرو اتاق جلسه توسط مدیر لغو شد",
  MEETING_ROOM_RESERVATION_CANCELLED_BY_USER:
    "رزرو اتاق جلسه توسط کاربر لغو شد",
  MEETING_ROOM_RESERVATION_CREATED: "درخواست رزرو اتاق جلسه ثبت شد",
  MEETING_ROOM_RESERVATION_REJECTED: "رزرو اتاق جلسه رد شد",
  MEETING_ROOM_SCHEDULE_CHANGED: "برنامه هفتگی اتاق جلسه تغییر کرد",
  MEETING_ROOM_UPDATED: "اتاق جلسه ویرایش شد",
  RESERVATION_APPROVED: "رزرو تایید شد",
  RESERVATION_AUTO_APPROVED: "رزرو به‌صورت خودکار تایید شد",
  RESERVATION_CANCELLED: "رزرو لغو شد",
  RESERVATION_CREATED: "درخواست رزرو ثبت شد",
  RESERVATION_POLICY_CHANGED: "سیاست رزرو تغییر کرد",
  RESERVATION_REJECTED: "رزرو رد شد",
  RESERVATION_TIME_UPDATED: "زمان رزرو تغییر کرد",
  SCHEDULE_EXCEPTION_CREATED: "استثنای برنامه کاری اضافه شد",
  SCHEDULE_EXCEPTION_DELETED: "استثنای برنامه کاری حذف شد",
  SCHEDULE_EXCEPTION_UPDATED: "استثنای برنامه کاری ویرایش شد",
  USER_CREATED: "کاربر ساخته شد",
  USER_DELETED: "کاربر حذف شد",
  USER_PASSWORD_RESET: "رمز عبور بازنشانی شد",
  USER_ROLE_CHANGED: "نقش کاربر تغییر کرد",
  USER_UPDATED: "کاربر ویرایش شد",
  WORKING_SCHEDULE_CHANGED: "برنامه هفتگی تغییر کرد",
  WIKI_PAGE_CREATED: "صفحه دانشنامه ساخته شد",
  WIKI_PAGE_DELETED: "صفحه دانشنامه حذف نرم شد",
  WIKI_PAGE_HIDDEN: "صفحه دانشنامه مخفی شد",
  WIKI_PAGE_IMPORTED_CREATED: "صفحه دانشنامه از فایل ایجاد شد",
  WIKI_PAGE_IMPORTED_UPDATED: "صفحه دانشنامه از فایل به‌روزرسانی شد",
  WIKI_PAGE_MOVED: "صفحه دانشنامه جابه‌جا شد",
  WIKI_PAGE_REORDERED: "ترتیب صفحه دانشنامه تغییر کرد",
  WIKI_PAGE_SHOWN: "صفحه دانشنامه نمایش داده شد",
  WIKI_PAGE_UPDATED: "صفحه دانشنامه ویرایش شد",
  WIKI_AI_SETTINGS_UPDATED: "تنظیمات دستیار دانش‌نامه تغییر کرد",
};

export const ENTITY_LABELS: Record<string, string> = {
  CalendarDayOverride: "اصلاح تقویم عملیاتی",
  Desk: "میز",
  DeskReservation: "رزرو میز",
  DeskSettings: "سیاست رزرو میز",
  Building: "ساختمان",
  BuildingWeeklySchedule: "برنامه هفتگی ساختمان",
  BuildingScheduleException: "استثنای ساختمان",
  BaleLunchReportRecipient: "گیرنده گزارش غذا",
  FoodReservation: "رزرو غذا",
  LunchReservation: "رزرو غذا",
  MaintenanceJob: "عملیات نگهداری خودکار",
  MeetingRoom: "اتاق جلسه",
  MeetingRoomReservation: "رزرو اتاق جلسه",
  MeetingRoomScheduleException: "استثنای اتاق جلسه",
  MeetingRoomWeeklySchedule: "برنامه هفتگی اتاق جلسه",
  Reservation: "رزرو",
  ReservationPolicy: "سیاست رزرو",
  ResourcePool: "ظرفیت",
  ResourcePoolCapacityException: "ظرفیت روزانه",
  ScheduleException: "استثنای برنامه کاری",
  User: "کاربر",
  WorkingSchedule: "برنامه هفتگی",
  WikiPage: "صفحه دانشنامه",
  WikiAiSettings: "تنظیمات دستیار دانش‌نامه",
};

const FIELD_LABELS: Record<string, string> = {
  active: "وضعیت کاربر",
  baseUrl: "نشانی سرویس مدل",
  capacity: "ظرفیت",
  dailyUserHourLimit: "سقف روزانه هر کاربر",
  canCreateSurveys: "امکان ساخت نظرسنجی",
  autoAcceptAt: "مهلت تایید خودکار",
  autoAcceptDelayHours: "مهلت تایید خودکار (ساعت)",
  autoAcceptEnabled: "فعال بودن تایید خودکار",
  autoApprovalAt: "مهلت auto accept اتاق جلسه",
  autoApprovalDelayHours: "مدت انتظار auto accept اتاق جلسه (ساعت)",
  autoApprovalEnabled: "فعال بودن auto accept اتاق جلسه",
  date: "تاریخ",
  email: "ایمیل",
  enabled: "فعال بودن",
  maxOutputTokens: "حداکثر توکن پاسخ",
  model: "نام مدل",
  systemPrompt: "دستورهای رفتاری دستیار",
  timeoutSeconds: "مهلت پاسخ",
  endAt: "پایان",
  endTime: "پایان کار",
  isWorkingDay: "روز کاری",
  mode: "رفتار تاریخ",
  name: "نام",
  oneReservationPerDayEnabled: "محدودیت یک رزرو در روز",
  partySize: "تعداد نفرات",
  proposedEndAt: "پایان پیشنهادی",
  proposedStartAt: "شروع پیشنهادی",
  reason: "دلیل",
  targets: "سرویس‌های تحت تأثیر",
  rejectionReason: "دلیل رد",
  role: "نقش",
  startAt: "شروع",
  startTime: "شروع کار",
  status: "وضعیت",
  parentSlug: "صفحه والد",
  slug: "شناسه مسیر",
  sortOrder: "ترتیب نمایش",
  title: "عنوان",
};

const DAY_LABELS: Record<number, string> = {
  0: "یک شنبه",
  1: "دو شنبه",
  2: "سه شنبه",
  3: "چهار شنبه",
  4: "پنج شنبه",
  5: "جمعه",
  6: "شنبه",
};

const STATUS_LABELS: Record<string, string> = {
  ALTERNATIVE_PROPOSED: "زمان جایگزین پیشنهاد شده",
  APPROVED: "تایید شده",
  CANCELLED: "لغو شده",
  PENDING: "در انتظار تایید",
  REJECTED: "رد شده",
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "ادمین",
  MANAGER: "مدیر",
  USER: "کاربر",
};

const NOISE_FIELDS = new Set([
  "alternativeId",
  "approvedAt",
  "approvedById",
  "cancelledAt",
  "cancelledById",
  "createdAt",
  "createdById",
  "id",
  "passwordReset",
  "resourcePoolId",
  "updatedAt",
  "userId",
]);

const DATE_RANGE_FIELDS = new Set([
  "endAt",
  "proposedEndAt",
  "proposedStartAt",
  "startAt",
]);

export const AUDIT_PAGE_SIZE = 25;

const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR");

export function formatPersianNumber(value: number): string {
  return PERSIAN_NUMBER_FORMATTER.format(value);
}

function addDays(date: Date, days: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    0,
    0,
    0,
    0,
  );
}

export function buildAuditWhere(
  params: AuditSearchParams | undefined,
): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (params?.actorId) {
    where.actorUserId = params.actorId;
  }

  if (params?.entityType) {
    where.entityType = params.entityType;
  }

  if (params?.action) {
    where.action = params.action;
  }

  const fromDate = parseJalaliDateParam(params?.from);
  const toDate = parseJalaliDateParam(params?.to);

  if (fromDate || toDate) {
    where.createdAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lt: addDays(toDate, 1) } : {}),
    };
  }

  return where;
}

function isRecord(value: Prisma.JsonValue | null): value is AuditJsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getRecord(value: Prisma.JsonValue | null): AuditJsonRecord {
  return isRecord(value) ? value : {};
}

function getString(record: AuditJsonRecord, key: string): string | null {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function getNumber(record: AuditJsonRecord, key: string): number | null {
  const value = record[key];

  return typeof value === "number" ? value : null;
}

function formatIsoDateTime(value: string): string | null {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatJalaliDateTime(date);
}

function formatIsoDateOnly(value: string): string | null {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatJalaliDateTime(date).split("،")[0] ?? null;
}

function formatDateRange(record: AuditJsonRecord): string | null {
  const startAt = getString(record, "startAt") ?? getString(record, "proposedStartAt");
  const endAt = getString(record, "endAt") ?? getString(record, "proposedEndAt");

  if (!startAt || !endAt) {
    return null;
  }

  const start = new Date(startAt);
  const end = new Date(endAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const endTime = formatJalaliDateTime(end).split("، ")[1] ?? "";

  return `${formatJalaliDateTime(start)} تا ${endTime}`;
}

function formatAuditValue(key: string, value: Prisma.JsonValue): string {
  if (value === null) {
    return "خالی";
  }

  if (typeof value === "boolean") {
    return value ? "بله" : "خیر";
  }

  if (typeof value === "number") {
    return key === "dayOfWeek"
      ? DAY_LABELS[value] ?? formatPersianNumber(value)
      : formatPersianNumber(value);
  }

  if (typeof value === "string") {
    if (key === "date") {
      return formatIsoDateOnly(value) ?? value;
    }

    if (key.endsWith("At") || key.startsWith("proposed")) {
      return formatIsoDateTime(value) ?? value;
    }

    if (key === "role") {
      return ROLE_LABELS[value] ?? value;
    }

    if (key === "status") {
      return STATUS_LABELS[value] ?? value;
    }

    return value;
  }

  return JSON.stringify(value);
}

export function formatChangeRows(
  log: AuditLogRow,
): Array<{ label: string; value: string }> {
  const oldRecord = getRecord(log.oldValue);
  const newRecord = getRecord(log.newValue);
  const source = Object.keys(newRecord).length > 0 ? newRecord : oldRecord;
  const hasDateRange = formatDateRange(source) !== null;
  const rows: Array<{ label: string; value: string }> = [];

  if (source.dayOfWeek !== undefined) {
    rows.push({
      label: "روز",
      value: formatAuditValue("dayOfWeek", source.dayOfWeek),
    });
  }

  for (const [key, value] of Object.entries(source)) {
    if (
      NOISE_FIELDS.has(key) ||
      key === "dayOfWeek" ||
      (hasDateRange && DATE_RANGE_FIELDS.has(key))
    ) {
      continue;
    }

    const oldValue = oldRecord[key];
    const changed = oldValue !== undefined && JSON.stringify(oldValue) !== JSON.stringify(value);

    rows.push({
      label: FIELD_LABELS[key] ?? key,
      value: changed
        ? `از ${formatAuditValue(key, oldValue)} به ${formatAuditValue(key, value)}`
        : formatAuditValue(key, value),
    });
  }

  return rows.slice(0, 3);
}

export function buildAuditDescription(log: AuditLogRow): string {
  const newRecord = getRecord(log.newValue);
  const oldRecord = getRecord(log.oldValue);
  const dateRange = formatDateRange(newRecord) ?? formatDateRange(oldRecord);

  if (dateRange) {
    return dateRange;
  }

  const capacity = getNumber(newRecord, "capacity");
  const oldCapacity = getNumber(oldRecord, "capacity");

  if (capacity !== null && oldCapacity !== null && capacity !== oldCapacity) {
    return `ظرفیت از ${formatPersianNumber(oldCapacity)} به ${formatPersianNumber(
      capacity,
    )} تغییر کرد`;
  }

  if (capacity !== null) {
    return `ظرفیت ${formatPersianNumber(capacity)}`;
  }

  const email = getString(newRecord, "email") ?? getString(oldRecord, "email");
  const name = getString(newRecord, "name") ?? getString(oldRecord, "name");

  if (name && email) {
    return `${name} (${email})`;
  }

  return "خلاصه بیشتری ثبت نشده است";
}

export function stringifyAuditValue(value: Prisma.JsonValue | null): string {
  if (value === null) {
    return "خالی";
  }

  return JSON.stringify(value, null, 2);
}

export function shortId(value: string): string {
  return value.length > 10 ? `${value.slice(0, 8)}…` : value;
}

export function getAuditPage(value: string | undefined): number {
  const parsedPage = Number(value);

  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    return 1;
  }

  return parsedPage;
}

export function getAuditPageHref(
  params: AuditSearchParams | undefined,
  page: number,
): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value && key !== "page") {
      searchParams.set(key, value);
    }
  }

  if (page > 1) {
    searchParams.set("page", String(page));
  }

  const query = searchParams.toString();

  return query ? `/admin/audit?${query}` : "/admin/audit";
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
