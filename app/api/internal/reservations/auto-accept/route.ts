import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { runAutoAcceptBatch } from "@/lib/auto-accept-service";

function secretsMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export async function POST(request: NextRequest) {
  const secret = process.env.AUTO_ACCEPT_CRON_SECRET?.trim();

  if (!secret) {
    return NextResponse.json(
      { error: "AUTO_ACCEPT_CRON_SECRET is not configured" },
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

  const result = await runAutoAcceptBatch();

  return NextResponse.json(result);
}
