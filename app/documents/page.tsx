import { FileText } from "lucide-react";

import { DocumentBrowserShell } from "@/components/documents/document-browser-shell";
import { requireCurrentUser } from "@/lib/auth";
import { getDocumentTree } from "@/lib/document-service";

export default async function DocumentsPage() {
  const user = await requireCurrentUser();
  const tree = await getDocumentTree(user.id);
  return (
    <DocumentBrowserShell items={tree}>
      <div className="flex min-h-64 flex-col items-center justify-center text-center">
        <FileText className="mb-3 h-10 w-10 text-slate-300" />
        <h2 className="font-semibold text-slate-900">{tree.length ? "یک صفحه را از فهرست انتخاب کنید" : "هنوز مستندی ثبت نشده است"}</h2>
        <p className="mt-2 text-sm text-slate-500">{tree.length ? "محتوای صفحه در این بخش نمایش داده می‌شود." : "مدیر سامانه می‌تواند نخستین پوشه یا صفحه را ایجاد کند."}</p>
      </div>
    </DocumentBrowserShell>
  );
}
