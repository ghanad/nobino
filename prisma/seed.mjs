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
      dailyUserHourLimit: 3,
      oneReservationPerDayEnabled: true,
    },
    create: {
      id: "default",
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
