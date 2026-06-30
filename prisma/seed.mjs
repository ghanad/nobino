import { PrismaClient, UserRole } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");

  return `scrypt$${salt}$${key}`;
}

async function upsertUser({ email, name, role, password }) {
  return prisma.user.upsert({
    where: { email },
    update: {
      name,
      role,
      active: true,
    },
    create: {
      email,
      name,
      role,
      active: true,
      passwordHash: hashPassword(password),
    },
  });
}

async function main() {
  await upsertUser({
    email: "admin@nobino.local",
    name: "Admin User",
    role: UserRole.ADMIN,
    password: "Admin123!",
  });

  await upsertUser({
    email: "manager@nobino.local",
    name: "Manager User",
    role: UserRole.MANAGER,
    password: "Manager123!",
  });

  await upsertUser({
    email: "user@nobino.local",
    name: "Normal User",
    role: UserRole.USER,
    password: "User123!",
  });

  await prisma.resourcePool.upsert({
    where: { id: "company-systems" },
    update: {
      name: "Company Systems",
      capacity: 5,
      active: true,
    },
    create: {
      id: "company-systems",
      name: "Company Systems",
      capacity: 5,
      active: true,
    },
  });

  await prisma.reservationPolicy.upsert({
    where: { id: "default" },
    update: {
      autoAcceptDelayHours: 4,
      autoAcceptEnabled: false,
      dailyUserHourLimit: 3,
      oneReservationPerDayEnabled: true,
    },
    create: {
      id: "default",
      autoAcceptDelayHours: 4,
      autoAcceptEnabled: false,
      dailyUserHourLimit: 3,
      oneReservationPerDayEnabled: true,
    },
  });

  const weeklySchedule = [
    { dayOfWeek: 0, isWorkingDay: true, startTime: "09:00", endTime: "17:00" },
    { dayOfWeek: 1, isWorkingDay: true, startTime: "09:00", endTime: "17:00" },
    { dayOfWeek: 2, isWorkingDay: true, startTime: "09:00", endTime: "17:00" },
    { dayOfWeek: 3, isWorkingDay: true, startTime: "09:00", endTime: "17:00" },
    { dayOfWeek: 4, isWorkingDay: true, startTime: "09:00", endTime: "17:00" },
    { dayOfWeek: 5, isWorkingDay: false, startTime: "09:00", endTime: "17:00" },
    { dayOfWeek: 6, isWorkingDay: true, startTime: "09:00", endTime: "17:00" },
  ];

  for (const day of weeklySchedule) {
    await prisma.workingSchedule.upsert({
      where: { dayOfWeek: day.dayOfWeek },
      update: day,
      create: day,
    });
  }

  await prisma.meetingRoom.upsert({
    where: { id: "main-meeting-room" },
    update: {
      name: "اتاق جلسه اصلی",
      description: "اتاق جلسه پیش‌فرض",
      location: "دفتر مرکزی",
      isActive: true,
      sortOrder: 1,
      autoApprovalEnabled: false,
      autoApprovalDelayHours: 4,
    },
    create: {
      id: "main-meeting-room",
      name: "اتاق جلسه اصلی",
      description: "اتاق جلسه پیش‌فرض",
      location: "دفتر مرکزی",
      isActive: true,
      sortOrder: 1,
      autoApprovalEnabled: false,
      autoApprovalDelayHours: 4,
    },
  });

  for (const day of weeklySchedule) {
    await prisma.meetingRoomWeeklySchedule.upsert({
      where: {
        roomId_dayOfWeek: {
          roomId: "main-meeting-room",
          dayOfWeek: day.dayOfWeek,
        },
      },
      update: {
        isWorkingDay: day.isWorkingDay,
        startTime: day.startTime,
        endTime: day.endTime,
      },
      create: {
        roomId: "main-meeting-room",
        dayOfWeek: day.dayOfWeek,
        isWorkingDay: day.isWorkingDay,
        startTime: day.startTime,
        endTime: day.endTime,
      },
    });
  }

  await prisma.lunchSettings.upsert({
    where: { id: "default" },
    update: {
      enabled: true,
      maxAdvanceDays: 7,
      cutoffTime: "23:59",
    },
    create: {
      id: "default",
      enabled: true,
      maxAdvanceDays: 7,
      cutoffTime: "23:59",
    },
  });

  for (const dayOfWeek of Array.from({ length: 7 }, (_, index) => index)) {
    await prisma.lunchWeeklySchedule.upsert({
      where: { dayOfWeek },
      update: {
        isServiceDay: dayOfWeek !== 5,
      },
      create: {
        dayOfWeek,
        isServiceDay: dayOfWeek !== 5,
      },
    });
  }

  for (const name of ["ساختمان A", "ساختمان B"]) {
    await prisma.lunchLocation.upsert({
      where: { name },
      update: { active: true },
      create: { name, active: true },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
