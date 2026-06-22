import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { syncBaleLunchReports } from "@/lib/bale-lunch-report-service";
import {
  consumeBaleUpdates,
  deliverPendingBaleNotifications,
  recordBaleSyncFailed,
  recordBaleSyncStarted,
  recordBaleSyncSucceeded,
} from "@/lib/bale-service";

function secretsMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export async function POST(request: NextRequest) {
  const secret = process.env.BALE_SYNC_SECRET?.trim();

  if (!secret) {
    return NextResponse.json(
      { error: "BALE_SYNC_SECRET is not configured" },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const suppliedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!secretsMatch(suppliedSecret, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await recordBaleSyncStarted();
    const updates = await consumeBaleUpdates();
    const deliveries = await deliverPendingBaleNotifications();
    const lunchReports = await syncBaleLunchReports();
    await recordBaleSyncSucceeded();
    return NextResponse.json({ ok: true, updates, deliveries, lunchReports });
  } catch (error) {
    console.error("Bale sync failed", error);

    try {
      await recordBaleSyncFailed(error);
    } catch (stateError) {
      console.error("Recording Bale sync failure failed", stateError);
    }

    return NextResponse.json({ error: "Bale sync failed" }, { status: 502 });
  }
}
