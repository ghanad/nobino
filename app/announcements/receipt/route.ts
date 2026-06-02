import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUserFromSessionToken } from "@/lib/auth";
import {
  AnnouncementError,
  recordAnnouncementReceipt,
} from "@/lib/announcement-service";
import { SESSION_COOKIE_NAME } from "@/lib/session";

const receiptSchema = z.object({
  acknowledge: z.boolean(),
  announcementId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromSessionToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = receiptSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid announcement" }, { status: 400 });
  }

  try {
    await recordAnnouncementReceipt({
      acknowledge: parsed.data.acknowledge,
      announcementId: parsed.data.announcementId,
      userId: user.id,
    });
    revalidatePath("/");

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AnnouncementError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    throw error;
  }
}
