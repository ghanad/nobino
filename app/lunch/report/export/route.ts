import { LunchReservationStatus } from "@prisma/client";
import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatJalaliDate,
  formatJalaliDateParam,
  parseJalaliDateParam,
} from "@/lib/jalali-date";
import { canAccessLunchReport } from "@/lib/permissions";

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const user = await requireCurrentUser();

  if (!canAccessLunchReport(user)) {
    redirect("/lunch");
  }

  const url = new URL(request.url);
  const requestedDate = parseJalaliDateParam(url.searchParams.get("date") ?? "");
  const date = requestedDate ?? new Date();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const reservations = await db.lunchReservation.findMany({
    where: {
      date: day,
      status: LunchReservationStatus.ACTIVE,
    },
    orderBy: [{ location: { name: "asc" } }, { user: { name: "asc" } }],
    select: {
      location: { select: { name: true } },
      user: { select: { name: true, email: true } },
    },
  });
  const rows = [
    ["date", "location", "name", "email"],
    ...reservations.map((reservation) => [
      formatJalaliDate(day),
      reservation.location.name,
      reservation.user.name,
      reservation.user.email,
    ]),
  ];
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const filename = `lunch-${formatJalaliDateParam(day)}.csv`;

  return new Response(`\uFEFF${csv}\n`, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
