import "server-only";

import { db } from "@/lib/db";
import { getIranHolidayForDate } from "@/lib/iran-holidays";

import { addDays, buildCutoffAt, startOfLocalDay } from "./date-time";
import { getLunchSettings } from "./settings";
import { DbClient, LunchReservationError } from "./shared";

export async function isLunchServiceDay(
  date: Date,
  client: DbClient = db,
): Promise<boolean> {
  const day = startOfLocalDay(date);
  const exception = await client.lunchException.findUnique({
    where: { date: day },
    select: { isServiceDay: true },
  });

  if (exception) {
    return exception.isServiceDay;
  }

  if (await getIranHolidayForDate(day)) {
    return false;
  }

  const weeklySchedule = await client.lunchWeeklySchedule.findUnique({
    where: { dayOfWeek: day.getDay() },
    select: { isServiceDay: true },
  });

  return weeklySchedule?.isServiceDay ?? day.getDay() !== 5;
}

export async function assertLunchDateIsReservable(input: {
  date: Date;
  now?: Date;
  client: DbClient;
}): Promise<void> {
  const now = input.now ?? new Date();
  const day = startOfLocalDay(input.date);
  const today = startOfLocalDay(now);
  const settings = await getLunchSettings(input.client);

  if (!settings.enabled) {
    throw new LunchReservationError("رزرو غذا فعلا غیرفعال است.");
  }

  if (day < today) {
    throw new LunchReservationError("امکان رزرو غذا برای روزهای گذشته وجود ندارد.");
  }

  if (day > addDays(today, settings.maxAdvanceDays)) {
    throw new LunchReservationError("این تاریخ خارج از بازه مجاز رزرو غذا است.");
  }

  if (!(await isLunchServiceDay(day, input.client))) {
    throw new LunchReservationError("برای این تاریخ سرویس غذا فعال نیست.");
  }

  if (now >= buildCutoffAt(day, settings.cutoffTime)) {
    throw new LunchReservationError("مهلت رزرو، تغییر یا لغو غذا برای این تاریخ گذشته است.");
  }
}

export async function getLunchReservationWindow(now: Date = new Date()) {
  const settings = await getLunchSettings();
  const today = startOfLocalDay(now);

  return Array.from({ length: settings.maxAdvanceDays + 1 }, (_, index) =>
    addDays(today, index),
  );
}

export async function getLunchDayState(input: {
  date: Date;
  now?: Date;
}) {
  const date = startOfLocalDay(input.date);
  const settings = await getLunchSettings();
  const isServiceDay = await isLunchServiceDay(date);
  const cutoffAt = buildCutoffAt(date, settings.cutoffTime);
  const now = input.now ?? new Date();

  return {
    date,
    cutoffAt,
    isOpen:
      settings.enabled &&
      isServiceDay &&
      date >= startOfLocalDay(now) &&
      date <= addDays(startOfLocalDay(now), settings.maxAdvanceDays) &&
      now < cutoffAt,
    isServiceDay,
  };
}
