import { NextResponse } from "next/server";

function getExpectedOrigins(request: Request): Set<string> {
  const origins = new Set([new URL(request.url).origin]);
  const configuredBaseUrl = process.env.APP_BASE_URL?.trim();

  if (configuredBaseUrl) {
    try {
      origins.add(new URL(configuredBaseUrl).origin);
    } catch {
      // Ignore a configuration typo and retain the request-derived origins.
    }
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(request.url).protocol.slice(0, -1);
    try {
      origins.add(new URL(`${protocol}://${host}`).origin);
    } catch {
      // Ignore malformed forwarded metadata.
    }
  }

  return origins;
}

/** Reject browser cross-site writes while allowing non-browser/internal callers without Origin. */
export function rejectCrossSiteWrite(request: Request): NextResponse | null {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (origin && !getExpectedOrigins(request).has(origin)) {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 403 });
  }

  return null;
}
