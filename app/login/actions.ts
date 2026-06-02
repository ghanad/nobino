"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSession, clearSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { authenticateLdapUser, getAuthProvider } from "@/lib/ldap-auth";
import { verifyPassword } from "@/lib/password";
import { findOrProvisionLdapUser } from "@/lib/user-management-service";

const emailSchema = z.string().email();
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

function getLdapLoginEmail(fallbackEmail: string, ldapEmail?: string): string {
  const email = ldapEmail?.trim().toLowerCase();

  if (email && emailSchema.safeParse(email).success) {
    return email;
  }

  return fallbackEmail;
}

function redirectInvalidLogin(): never {
  redirect("/login?error=invalid");
}

export async function loginAction(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirectInvalidLogin();
  }

  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;
  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      active: true,
      passwordHash: true,
    },
  });

  const authProvider = getAuthProvider();

  if (authProvider === "local") {
    if (!user?.active || !(await verifyPassword(password, user.passwordHash))) {
      redirectInvalidLogin();
    }

    await createSession(user.id);
    redirect("/reservations");
  }

  if (user && !user.active) {
    redirectInvalidLogin();
  }

  if (
    authProvider === "hybrid" &&
    user &&
    (await verifyPassword(password, user.passwordHash))
  ) {
    await createSession(user.id);
    redirect("/reservations");
  }

  const ldapUser = await authenticateLdapUser(email, password);

  if (!ldapUser) {
    redirectInvalidLogin();
  }

  const sessionUser =
    user ??
    (await findOrProvisionLdapUser({
      email: getLdapLoginEmail(email, ldapUser.email),
      name: ldapUser.name,
    }));

  if (!sessionUser?.active) {
    redirectInvalidLogin();
  }

  await createSession(sessionUser.id);
  redirect("/reservations");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
