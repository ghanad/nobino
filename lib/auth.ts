import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User, UserRole } from "@prisma/client";

import { db } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "@/lib/session";

const SESSION_TTL_SECONDS = 60 * 60 * 8;

type SessionPayload = {
  userId: string;
  expiresAt: number;
};

export type CurrentUser = Pick<
  User,
  "id" | "name" | "email" | "role" | "active"
>;

function getSessionSecret(): string {
  if (process.env.AUTH_SECRET) {
    return process.env.AUTH_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production");
  }

  return "dev-only-nobino-session-secret-change-me";
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function createSessionToken(payload: SessionPayload): string {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function parseSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  if (!signaturesMatch(signature, sign(encodedPayload))) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload;

    if (
      typeof payload.userId !== "string" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;

  cookieStore.set(SESSION_COOKIE_NAME, createSessionToken({ userId, expiresAt }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const payload = parseSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!payload) {
    return null;
  }

  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
    },
  });

  if (!user?.active) {
    return null;
  }

  return user;
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireRole(allowedRoles: UserRole[]): Promise<CurrentUser> {
  const user = await requireCurrentUser();

  if (!allowedRoles.includes(user.role)) {
    redirect("/dashboard");
  }

  return user;
}
