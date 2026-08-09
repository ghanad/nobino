"use server";

import { revalidatePath } from "next/cache";

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

export type BaleConnectionActionState = {
  message: string;
  status: "error" | "idle" | "success";
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

export async function checkBaleConnectionAction(
  _previousState: BaleConnectionActionState,
): Promise<BaleConnectionActionState> {
  void _previousState;
  const user = await requireCurrentUser();

  try {
    await consumeBaleUpdates();
  } catch {
    return { message: "ارتباط با بات بله برقرار نشد. دوباره تلاش کنید.", status: "error" };
  }

  const connection = await db.baleConnection.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  revalidatePath("/settings/bale");
  return connection
    ? { message: "حساب بله با موفقیت متصل شد.", status: "success" }
    : {
        message: "هنوز پیام اتصال از بات دریافت نشده است. ابتدا دستور را برای بات ارسال کنید.",
        status: "error",
      };
}

export async function disconnectBaleAccountAction(
  _previousState: BaleConnectionActionState,
): Promise<BaleConnectionActionState> {
  void _previousState;
  const user = await requireCurrentUser();
  await disconnectBaleAccount(user.id);
  revalidatePath("/settings/bale");
  return { message: "اتصال حساب بله قطع شد.", status: "success" };
}
