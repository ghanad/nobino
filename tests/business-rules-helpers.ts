import { after, beforeEach } from "node:test";

import { PrismaClient, ReservationStatus, UserRole } from "@prisma/client";

import { getIranHolidaysForJalaliYear } from "@/lib/iran-holidays";
import { formatJalaliDateParam } from "@/lib/jalali-date";

export const db = new PrismaClient();

export const passwordHash = "test-password-hash";
export const poolId = "company-systems";
export const meetingRoomId = "main-meeting-room";
export const secondMeetingRoomId = "second-meeting-room";
export const buildingId = "main-building";
export const deskId = "desk-one";
export const secondDeskId = "desk-two";
export const secondBuildingId = "building-b";
export const lunchReportRecipientId = "lunch-report-recipient-a";
export const secondLunchReportRecipientId = "lunch-report-recipient-b";
export const userId = "normal-user";
export const secondUserId = "second-user";
export const managerId = "manager-user";
export const adminId = "admin-user";

let hooksRegistered = false;

export function registerBusinessRuleTestHooks() {
  if (hooksRegistered) {
    return;
  }

  hooksRegistered = true;
  beforeEach(resetDatabase);
  after(async () => {
    await db.$disconnect();
  });
}

export function nextWorkingDateAtHour(hour: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);

  while (date.getDay() === 5) {
    date.setDate(date.getDate() + 1);
  }

  return date;
}

export function previousWorkingDateAtHour(hour: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(hour, 0, 0, 0);

  while (date.getDay() === 5) {
    date.setDate(date.getDate() - 1);
  }

  return date;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);

  return next;
}

export function startOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
}

export async function markDateWorkingForTest(date: Date) {
  await db.scheduleException.upsert({
    where: { date: startOfLocalDay(date) },
    update: {
      isWorkingDay: true,
      startTime: "09:00",
      endTime: "17:00",
      reason: "Test working day",
    },
    create: {
      date: startOfLocalDay(date),
      isWorkingDay: true,
      startTime: "09:00",
      endTime: "17:00",
      reason: "Test working day",
    },
  });
}

export async function nextIranHolidayDateAtHour(hour: number): Promise<Date> {
  const currentJalaliYear = Number(formatJalaliDateParam(new Date()).slice(0, 4));

  for (let year = currentJalaliYear; year <= currentJalaliYear + 2; year += 1) {
    const holidays = await getIranHolidaysForJalaliYear(year);
    const futureHoliday = holidays
      .map((holiday) => {
        const date = new Date(holiday.date);
        date.setHours(hour, 0, 0, 0);

        return date;
      })
      .find((date) => date.getTime() > Date.now());

    if (futureHoliday) {
      return futureHoliday;
    }
  }

  throw new Error("No future Iran holiday found for test.");
}

export async function nextMidweekIranHolidayDateAtHour(
  hour: number,
): Promise<Date> {
  const currentJalaliYear = Number(formatJalaliDateParam(new Date()).slice(0, 4));

  for (let year = currentJalaliYear; year <= currentJalaliYear + 2; year += 1) {
    const holidays = await getIranHolidaysForJalaliYear(year);
    const futureHoliday = holidays
      .map((holiday) => {
        const date = new Date(holiday.date);
        date.setHours(hour, 0, 0, 0);

        return date;
      })
      .find((date) => date.getDay() !== 5 && date.getTime() > Date.now());

    if (futureHoliday) {
      return futureHoliday;
    }
  }

  throw new Error("No future midweek Iran holiday found for test.");
}

export async function resetDatabase() {
  await db.surveyAnswerOption.deleteMany();
  await db.surveyAnswer.deleteMany();
  await db.surveyResponse.deleteMany();
  await db.surveyDraft.deleteMany();
  await db.surveyRecipient.deleteMany();
  await db.surveyQuestionCondition.deleteMany();
  await db.surveyOption.deleteMany();
  await db.surveyQuestion.deleteMany();
  await db.surveyAudienceUser.deleteMany();
  await db.surveyAudienceTeam.deleteMany();
  await db.surveyCollaborator.deleteMany();
  await db.survey.deleteMany();
  await db.baleLunchReportDelivery.deleteMany();
  await db.baleLunchReportRecipient.deleteMany();
  await db.baleNotificationDelivery.deleteMany();
  await db.notification.deleteMany();
  await db.baleLinkToken.deleteMany();
  await db.baleConnection.deleteMany();
  await db.baleBotState.deleteMany();
  await db.auditLog.deleteMany();
  await db.calendarDayOverrideTarget.deleteMany();
  await db.calendarDayOverride.deleteMany();
  await db.wikiPageRevision.deleteMany();
  await db.wikiPage.deleteMany();
  await db.wikiAiSettings.deleteMany();
  await db.lunchReservation.deleteMany();
  await db.lunchException.deleteMany();
  await db.lunchWeeklySchedule.deleteMany();
  await db.lunchSettings.deleteMany();
  await db.reservationAlternative.deleteMany();
  await db.reservation.deleteMany();
  await db.meetingRoomReservation.deleteMany();
  await db.meetingRoomScheduleException.deleteMany();
  await db.meetingRoomWeeklySchedule.deleteMany();
  await db.meetingRoom.deleteMany();
  await db.deskReservation.deleteMany();
  await db.buildingScheduleException.deleteMany();
  await db.buildingWeeklySchedule.deleteMany();
  await db.desk.deleteMany();
  await db.deskSettings.deleteMany();
  await db.resourcePoolCapacityException.deleteMany();
  await db.resourcePool.deleteMany();
  await db.building.deleteMany();
  await db.scheduleException.deleteMany();
  await db.workingSchedule.deleteMany();
  await db.teamMembership.deleteMany();
  await db.team.deleteMany();
  await db.reservationPolicy.deleteMany();
  await db.user.deleteMany();

  await db.user.createMany({
    data: [
      {
        id: userId,
        email: "user@example.test",
        name: "Normal User",
        passwordHash,
        role: UserRole.USER,
      },
      {
        id: secondUserId,
        email: "second@example.test",
        name: "Second User",
        passwordHash,
        role: UserRole.USER,
      },
      {
        id: managerId,
        email: "manager@example.test",
        name: "Manager User",
        passwordHash,
        role: UserRole.MANAGER,
      },
      {
        id: adminId,
        email: "admin@example.test",
        name: "Admin User",
        passwordHash,
        role: UserRole.ADMIN,
      },
    ],
  });

  await db.building.create({
    data: { id: buildingId, name: "Main Building", active: true },
  });

  await db.resourcePool.create({
    data: {
      id: poolId,
      buildingId,
      name: "Company Systems",
      capacity: 1,
      active: true,
    },
  });

  await db.reservationPolicy.create({
    data: {
      id: "default",
      autoAcceptDelayHours: 4,
      autoAcceptEnabled: false,
      dailyUserHourLimit: 3,
      oneReservationPerDayEnabled: true,
    },
  });

  await db.workingSchedule.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      isWorkingDay: dayOfWeek !== 5,
      startTime: "09:00",
      endTime: "17:00",
    })),
  });

  await db.meetingRoom.createMany({
    data: [
      {
        id: meetingRoomId,
        name: "Main Meeting Room",
        isActive: true,
        sortOrder: 1,
        autoApprovalEnabled: false,
        autoApprovalDelayHours: 4,
      },
      {
        id: secondMeetingRoomId,
        name: "Second Meeting Room",
        isActive: true,
        sortOrder: 2,
        autoApprovalEnabled: false,
        autoApprovalDelayHours: 4,
      },
    ],
  });

  await db.meetingRoomWeeklySchedule.createMany({
    data: [meetingRoomId, secondMeetingRoomId].flatMap((roomId) =>
      Array.from({ length: 7 }, (_, dayOfWeek) => ({
        roomId,
        dayOfWeek,
        isWorkingDay: dayOfWeek !== 5,
        startTime: "09:00",
        endTime: "17:00",
      })),
    ),
  });

  await db.deskSettings.create({
    data: {
      autoApprovalDelayHours: 4,
      autoApprovalEnabled: false,
      id: "default",
      maxAdvanceDays: 14,
    },
  });
  await db.desk.createMany({ data: [
    { id: deskId, buildingId, name: "Desk One", active: true, sortOrder: 1 },
    { id: secondDeskId, buildingId, name: "Desk Two", active: true, sortOrder: 2 },
  ] });
  await db.buildingWeeklySchedule.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      buildingId, dayOfWeek, isWorkingDay: dayOfWeek !== 5, startTime: "09:00", endTime: "17:00",
    })),
  });
  await db.buildingScheduleException.create({
    data: {
      date: startOfLocalDay(nextWorkingDateAtHour(9)),
      endTime: "17:00",
      isWorkingDay: true,
      buildingId,
      reason: "Test working day",
      startTime: "09:00",
    },
  });

  await db.lunchSettings.create({
    data: {
      id: "default",
      enabled: true,
      maxAdvanceDays: 7,
      cutoffTime: "23:59",
    },
  });

  await db.lunchWeeklySchedule.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      isServiceDay: dayOfWeek !== 5,
    })),
  });

  await db.lunchException.create({
    data: {
      date: startOfLocalDay(nextWorkingDateAtHour(12)),
      isServiceDay: true,
    },
  });

  await db.building.createMany({
    data: [
      {
        id: secondBuildingId,
        name: "Building B",
        active: true,
      },
    ],
  });
}

export async function markMeetingRoomDateWorkingForTest(
  date: Date,
  roomId = meetingRoomId,
) {
  await db.meetingRoomScheduleException.upsert({
    where: {
      roomId_date: {
        roomId,
        date: startOfLocalDay(date),
      },
    },
    update: {
      isWorkingDay: true,
      startTime: "09:00",
      endTime: "17:00",
      reason: "Test meeting room working day",
    },
    create: {
      roomId,
      date: startOfLocalDay(date),
      isWorkingDay: true,
      startTime: "09:00",
      endTime: "17:00",
      reason: "Test meeting room working day",
    },
  });
}

export async function createReservation(input: {
  userId?: string;
  startAt: Date;
  endAt: Date;
  partySize?: number;
  status: ReservationStatus;
}) {
  return db.reservation.create({
    data: {
      userId: input.userId ?? userId,
      resourcePoolId: poolId,
      startAt: input.startAt,
      endAt: input.endAt,
      partySize: input.partySize ?? 1,
      status: input.status,
    },
  });
}

export async function createLunchReportRecipient(input?: {
  active?: boolean;
  chatId?: string | null;
  id?: string;
  name?: string;
  userId?: string;
}) {
  return db.baleLunchReportRecipient.create({
    data: {
      active: input?.active ?? true,
      chatId: input?.userId ? null : (input?.chatId ?? "123456780"),
      id: input?.id ?? lunchReportRecipientId,
      name: input?.name ?? "گروه عملیات",
      userId: input?.userId,
    },
  });
}
