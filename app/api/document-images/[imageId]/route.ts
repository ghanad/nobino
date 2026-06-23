import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readStoredDocumentImage } from "@/lib/document-image-storage";

export async function GET(_request: Request, context: { params: Promise<{ imageId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { imageId } = await context.params;
  const image = await db.documentImage.findUnique({
    where: { id: imageId },
    select: { byteSize: true, mimeType: true, storedFileName: true },
  });
  if (!image) return new Response("Not found", { status: 404 });

  try {
    const bytes = await readStoredDocumentImage(image.storedFileName);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(bytes.length),
        "Content-Type": image.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
