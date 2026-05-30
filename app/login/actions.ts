"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSession, clearSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { authenticateLdapUser, getAuthProvider } from "@/lib/ldap-auth";
import { verifyPassword } from "@/lib/password";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginAction(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/login?error=invalid");
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });

  if (!user?.active) {
    redirect("/login?error=invalid");
  }

  const authProvider = getAuthProvider();
  const passwordIsValid =
    authProvider === "ldap"
      ? Boolean(await authenticateLdapUser(email, parsed.data.password))
      : authProvider === "hybrid"
        ? (await verifyPassword(parsed.data.password, user.passwordHash)) ||
          Boolean(await authenticateLdapUser(email, parsed.data.password))
        : await verifyPassword(parsed.data.password, user.passwordHash);

  if (!passwordIsValid) {
    redirect("/login?error=invalid");
  }

  await createSession(user.id);
  redirect("/reservations");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
