import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  importWiki,
  parseWikiImportFile,
} from "@/lib/wiki-transfer-service";

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

function redirectToTransfer(params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  const location = `/wiki/transfer?${searchParams.toString()}`;

  return new NextResponse(null, {
    headers: { Location: location },
    status: 303,
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  if (user.role !== "ADMIN") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("wikiFile");

    if (!(file instanceof File) || file.size === 0) {
      return redirectToTransfer({
        error: "لطفاً فایل خروجی دانشنامه را انتخاب کنید.",
      });
    }

    if (file.size > MAX_IMPORT_BYTES) {
      return redirectToTransfer({
        error: "حجم فایل نباید بیشتر از ۱۰ مگابایت باشد.",
      });
    }

    let rawData: unknown;

    try {
      rawData = JSON.parse(await file.text());
    } catch {
      return redirectToTransfer({
        error: "فایل انتخاب‌شده JSON معتبر نیست.",
      });
    }

    const result = await importWiki(parseWikiImportFile(rawData), user);

    return redirectToTransfer({
      created: String(result.created),
      imported: "1",
      unchanged: String(result.unchanged),
      updated: String(result.updated),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "WikiPermissionError" || error.name === "WikiValidationError")
    ) {
      return redirectToTransfer({ error: error.message });
    }

    throw error;
  }
}
