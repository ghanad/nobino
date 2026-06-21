"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth";
import {
  consumeBaleUpdates,
  createBaleLinkToken,
  disconnectBaleAccount,
} from "@/lib/bale-service";
import { db } from "@/lib/db";

export type BaleLinkActionState = {
  command?: string;
  error?: string;
  expiresAt?: string;
};

export async function generateBaleLinkCodeAction(): Promise<BaleLinkActionState> {
  const user = await requireCurrentUser();

  try {
    const result = await createBaleLinkToken(user.id);
    return {
      command: result.command,
      expiresAt: result.expiresAt.toISOString(),
    };
  } catch {
    return { error: "ساخت کد اتصال انجام نشد. دوباره تلاش کنید." };
  }
}

export async function checkBaleConnectionAction(): Promise<never> {
  const user = await requireCurrentUser();

  try {
    await consumeBaleUpdates();
  } catch {
    redirect("/settings/bale?error=sync");
  }

  const connection = await db.baleConnection.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  revalidatePath("/settings/bale");
  redirect(
    connection
      ? "/settings/bale?connected=1"
      : "/settings/bale?error=not-connected",
  );
}

export async function disconnectBaleAccountAction(): Promise<never> {
  const user = await requireCurrentUser();
  await disconnectBaleAccount(user.id);
  revalidatePath("/settings/bale");
  redirect("/settings/bale?disconnected=1");
}
