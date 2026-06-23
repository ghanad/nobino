import { DocumentNodeType } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  createDocumentNode,
  deleteDocumentNode,
  DocumentServiceError,
  moveDocumentNode,
  renameDocumentNode,
  updateDocumentPage,
} from "@/lib/document-service";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "عملیات انجام نشد.";
  return NextResponse.json({ error: message }, { status: error instanceof DocumentServiceError ? 400 : 500 });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ورود به حساب الزامی است." }, { status: 401 });
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === "create") {
      const node = await createDocumentNode({
        adminId: user.id,
        parentId: typeof body.parentId === "string" ? body.parentId : null,
        title: String(body.title ?? ""),
        type: body.type === "FOLDER" ? DocumentNodeType.FOLDER : DocumentNodeType.PAGE,
      });
      return NextResponse.json({ node });
    }
    if (body.action === "rename") {
      const node = await renameDocumentNode({ adminId: user.id, documentId: String(body.documentId ?? ""), title: String(body.title ?? "") });
      return NextResponse.json({ node });
    }
    if (body.action === "move") {
      const node = await moveDocumentNode({
        adminId: user.id,
        documentId: String(body.documentId ?? ""),
        parentId: typeof body.parentId === "string" && body.parentId ? body.parentId : null,
        position: typeof body.position === "number" ? body.position : undefined,
      });
      return NextResponse.json({ node });
    }
    if (body.action === "delete") {
      await deleteDocumentNode({ adminId: user.id, documentId: String(body.documentId ?? "") });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "update") {
      const node = await updateDocumentPage({
        adminId: user.id,
        documentId: String(body.documentId ?? ""),
        content: body.content,
        expectedUpdatedAt: new Date(String(body.expectedUpdatedAt ?? "")),
      });
      return NextResponse.json({ node });
    }
    return NextResponse.json({ error: "عملیات نامعتبر است." }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
