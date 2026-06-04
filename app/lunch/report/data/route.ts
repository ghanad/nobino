import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromSessionToken } from "@/lib/auth";
import { parseJalaliDateParam } from "@/lib/jalali-date";
import { getLunchReportForDate } from "@/lib/lunch-report-service";
import { canAccessLunchReport } from "@/lib/permissions";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromSessionToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessLunchReport(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requestedDate = parseJalaliDateParam(
    request.nextUrl.searchParams.get("date") ?? "",
  );
  const report = await getLunchReportForDate(requestedDate ?? new Date());

  return NextResponse.json(report);
}
