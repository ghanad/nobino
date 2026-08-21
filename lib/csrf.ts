import { NextResponse } from "next/server";

/** Reject browser cross-site writes while allowing non-browser/internal callers without Origin. */
export function rejectCrossSiteWrite(request: Request): NextResponse | null {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 403 });
  }

  return null;
}
