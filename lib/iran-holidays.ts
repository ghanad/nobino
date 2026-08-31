import "server-only";

import type { PHolidayDate } from "pholiday";

import {
  formatJalaliDateParam,
  parseJalaliDateParam,
} from "@/lib/jalali-date";

export type IranHoliday = {
  date: Date;
  dateParam: string;
  title: string;
};

const OFFICIAL_HOLIDAY_OVERRIDES: Record<
  number,
  Record<string, string>
> = {
  1405: {
    "1405-01-01": "عید سعید فطر - آغاز نوروز",
    "1405-01-02": "تعطیل به مناسبت عید سعید فطر - عید نوروز",
    "1405-01-03": "عید نوروز",
    "1405-01-04": "عید نوروز",
    "1405-01-12": "روز جمهوری اسلامی ایران",
    "1405-01-13": "روز طبیعت",
    "1405-01-25": "شهادت امام جعفر صادق (ع)",
    "1405-03-06": "عید سعید قربان",
    "1405-03-14": "عید سعید غدیر خم - رحلت امام خمینی",
    "1405-03-15": "قیام خونین ۱۵ خرداد",
    "1405-04-03": "تاسوعای حسینی",
    "1405-04-04": "عاشورای حسینی",
    "1405-05-13": "اربعین حسینی",
    "1405-05-21": "رحلت حضرت رسول اکرم (ص) - شهادت امام حسن مجتبی (ع)",
    "1405-05-22": "شهادت امام رضا (ع)",
    "1405-05-30": "شهادت امام حسن عسکری (ع) - آغاز امامت حضرت ولیعصر (عج)",
    "1405-06-08": "ولادت حضرت رسول اکرم (ص) - ولادت امام جعفر صادق (ع)",
    "1405-08-22": "شهادت حضرت فاطمه زهرا (س)",
    "1405-10-02": "ولادت امام علی (ع) - روز پدر",
    "1405-10-16": "مبعث حضرت رسول اکرم (ص)",
    "1405-11-04": "ولادت حضرت قائم عجل الله تعالی فرجه",
    "1405-11-22": "پیروزی انقلاب اسلامی ایران",
    "1405-12-09": "شهادت حضرت علی (ع)",
    "1405-12-19": "عید سعید فطر",
    "1405-12-20": "تعطیل به مناسبت عید سعید فطر",
    "1405-12-29": "روز ملی شدن صنعت نفت ایران",
  },
};

type PHolidayFactory = (input?: string | Date, format?: string) => PHolidayDate;

let cachedPHoliday: PHolidayFactory | null = null;

async function getPHoliday(): Promise<PHolidayFactory> {
  cachedPHoliday ??= (await import("pholiday")).default as PHolidayFactory;

  return cachedPHoliday;
}

async function getOfficialHolidayTitles(date: Date): Promise<string[]> {
  const dateParam = formatJalaliDateParam(date).replaceAll("-", "/");
  const pholiday = await getPHoliday();
  const events = pholiday(dateParam, "jYYYY/jMM/jDD").events();

  return events
    .filter((event) => event.isHoliday && !event.isFriday)
    .map((event) => event.event.trim())
    .filter(Boolean);
}

export async function getIranHolidayForDate(
  date: Date,
): Promise<IranHoliday | null> {
  const dateParam = formatJalaliDateParam(date);
  const yearOverrides =
    OFFICIAL_HOLIDAY_OVERRIDES[Number(dateParam.slice(0, 4))];
  const overrideTitle = yearOverrides?.[dateParam];

  if (overrideTitle) {
    return {
      date,
      dateParam,
      title: overrideTitle,
    };
  }

  // A year override is a complete authoritative calendar. Falling back to
  // pholiday for its other dates would re-add lunar holidays on their stale
  // calculated dates alongside the corrected official dates.
  if (yearOverrides) {
    return null;
  }

  const titles = await getOfficialHolidayTitles(date);

  if (titles.length === 0) {
    return null;
  }

  return {
    date,
    dateParam,
    title: titles.join("، "),
  };
}

export async function getIranHolidaysForJalaliYear(
  year: number,
): Promise<IranHoliday[]> {
  const holidays: IranHoliday[] = [];

  for (let month = 1; month <= 12; month += 1) {
    for (let day = 1; day <= 31; day += 1) {
      const dateParam = [
        year.toString().padStart(4, "0"),
        month.toString().padStart(2, "0"),
        day.toString().padStart(2, "0"),
      ].join("-");
      const date = parseJalaliDateParam(dateParam);

      if (!date) {
        continue;
      }

      const holiday = await getIranHolidayForDate(date);

      if (holiday) {
        holidays.push(holiday);
      }
    }
  }

  return holidays;
}
