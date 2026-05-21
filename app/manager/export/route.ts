import { ReservationStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatJalaliDateParam,
  formatJalaliDateTime,
  formatLocalTime,
  parseJalaliDateParam,
} from "@/lib/jalali-date";
import { isManagerOrAdmin } from "@/lib/permissions";

function startOfLocalDay(date: Date): Date {
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

function escapeCsvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);

  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
    .join("\r\n");
}

function statusLabel(status: ReservationStatus): string {
  return status.replaceAll("_", " ");
}

export async function GET(request: Request): Promise<Response> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (!isManagerOrAdmin(currentUser.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const selectedDate = parseJalaliDateParam(url.searchParams.get("date") ?? "") ??
    startOfLocalDay(new Date());
  const dayStart = startOfLocalDay(selectedDate);
  const dayEnd = addDays(dayStart, 1);
  const dateParam = formatJalaliDateParam(dayStart);

  const reservations = await db.reservation.findMany({
    where: {
      startAt: { lt: dayEnd },
      endAt: { gt: dayStart },
    },
    orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      reason: true,
      rejectionReason: true,
      approvedAt: true,
      cancelledAt: true,
      createdAt: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
      resourcePool: {
        select: {
          name: true,
        },
      },
      approvedBy: {
        select: {
          name: true,
        },
      },
      cancelledBy: {
        select: {
          name: true,
        },
      },
    },
  });

  const rows = [
    [
      "Reservation ID",
      "Requester",
      "Requester Email",
      "Resource Pool",
      "Status",
      "Start",
      "End",
      "Start Hour",
      "End Hour",
      "Reason",
      "Rejection Reason",
      "Approved At",
      "Approved By",
      "Cancelled At",
      "Cancelled By",
      "Created At",
    ],
    ...reservations.map((reservation) => [
      reservation.id,
      reservation.user.name,
      reservation.user.email,
      reservation.resourcePool.name,
      statusLabel(reservation.status),
      formatJalaliDateTime(reservation.startAt),
      formatJalaliDateTime(reservation.endAt),
      formatLocalTime(reservation.startAt),
      formatLocalTime(reservation.endAt),
      reservation.reason ?? "",
      reservation.rejectionReason ?? "",
      reservation.approvedAt ? formatJalaliDateTime(reservation.approvedAt) : "",
      reservation.approvedBy?.name ?? "",
      reservation.cancelledAt ? formatJalaliDateTime(reservation.cancelledAt) : "",
      reservation.cancelledBy?.name ?? "",
      formatJalaliDateTime(reservation.createdAt),
    ]),
  ];

  const csv = buildCsv(rows);

  return new NextResponse(`\uFEFF${csv}\r\n`, {
    headers: {
      "Content-Disposition": `attachment; filename="reservations-${dateParam}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
