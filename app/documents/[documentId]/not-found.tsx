import Link from "next/link";

export default function DocumentNotFound() {
  return <div className="rounded-lg border bg-card p-8 text-center" dir="rtl"><h1 className="text-xl font-bold">صفحه پیدا نشد</h1><p className="mt-2 text-sm text-slate-600">این صفحه حذف شده یا نشانی آن معتبر نیست.</p><Link className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" href="/documents">بازگشت به مستندات</Link></div>;
}
