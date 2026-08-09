import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { exportWiki } from "@/lib/wiki-transfer-service";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (user.role !== "ADMIN") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const data = await exportWiki(user);
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="nobino-wiki-${date}.json"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
