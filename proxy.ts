import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/session";

const PROTECTED_PREFIXES = [
  "/reservations",
  "/notifications",
  "/settings",
  "/wiki",
  "/manager",
  "/admin",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedPath = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!isProtectedPath) {
    return NextResponse.next();
  }

  if (request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/reservations/:path*",
    "/notifications/:path*",
    "/settings/:path*",
    "/wiki/:path*",
    "/manager/:path*",
    "/admin/:path*",
  ],
};
