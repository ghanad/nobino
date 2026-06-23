import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { MAX_DOCUMENT_IMAGE_BYTES } from "@/lib/document-image-storage";
import { DocumentServiceError, uploadDocumentImage } from "@/lib/document-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ورود به حساب الزامی است." }, { status: 401 });
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "فایل تصویر الزامی است." }, { status: 400 });
    if (file.size > MAX_DOCUMENT_IMAGE_BYTES) return NextResponse.json({ error: "حجم تصویر باید حداکثر ۵ مگابایت باشد." }, { status: 400 });
    const { documentId } = await context.params;
    const image = await uploadDocumentImage({
      adminId: user.id,
      documentId,
      bytes: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
      originalFileName: file.name,
    });
    return NextResponse.json({ image });
  } catch (error) {
    const message = error instanceof Error ? error.message : "بارگذاری تصویر انجام نشد.";
    return NextResponse.json({ error: message }, { status: error instanceof DocumentServiceError ? 400 : 400 });
  }
}
