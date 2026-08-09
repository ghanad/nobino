import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Info } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { UrlToast } from "@/components/ui/url-toast";
import { getCurrentUser } from "@/lib/auth";

import { WikiImportForm } from "./wiki-import-form";

type WikiTransferPageProps = {
  searchParams?: Promise<{
    created?: string;
    error?: string;
    imported?: string;
    unchanged?: string;
    updated?: string;
  }>;
};

function parseCount(value: string | undefined): number {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function formatPersianCount(value: number): string {
  return new Intl.NumberFormat("fa-IR", { useGrouping: false }).format(value);
}

export default async function WikiTransferPage({
  searchParams,
}: WikiTransferPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "ADMIN") {
    redirect("/wiki");
  }

  const query = await searchParams;
  const importedMessage = query?.imported
    ? `${formatPersianCount(parseCount(query.created))} صفحه ایجاد، ${formatPersianCount(parseCount(query.updated))} صفحه به‌روزرسانی و ${formatPersianCount(parseCount(query.unchanged))} صفحه بدون تغییر باقی ماند.`
    : null;

  return (
    <AppShell user={user}>
      <div className="grid gap-6" dir="rtl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageHeader
            subtitle="انتقال امن صفحه‌ها بین محیط توسعه و production"
            title="خروجی و ورود دانشنامه"
          />
          <Button asChild variant="outline">
            <Link href="/wiki">بازگشت به دانشنامه</Link>
          </Button>
        </div>

        {query?.error ? (
          <UrlToast consumeKeys={["error"]} message={query.error} variant="error" />
        ) : null}
        {importedMessage ? (
          <UrlToast
            consumeKeys={["imported", "created", "updated", "unchanged"]}
            message={importedMessage}
            variant="success"
          />
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="grid content-start gap-4 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="grid gap-2">
              <h2 className="text-base font-semibold text-slate-950">
                ۱. دریافت خروجی
              </h2>
              <p className="text-sm leading-7 text-muted-foreground">
                همه صفحه‌های فعال، محتوای آن‌ها، ترتیب، ساختار والد و فرزند و وضعیت
                مخفی‌بودن در یک فایل JSON ذخیره می‌شوند.
              </p>
            </div>
            <div>
              <Button asChild>
                <a download href="/wiki/export">
                  <Download aria-hidden="true" className="h-4 w-4" />
                  دریافت فایل خروجی
                </a>
              </Button>
            </div>
          </section>

          <section className="grid content-start gap-4 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="grid gap-2">
              <h2 className="text-base font-semibold text-slate-950">
                ۲. ورود در مقصد
              </h2>
              <p className="text-sm leading-7 text-muted-foreground">
                همین فایل را در محیط مقصد انتخاب کنید. صفحه‌های هم‌نام بر اساس slug
                به‌روزرسانی و صفحه‌های تازه ایجاد می‌شوند.
              </p>
            </div>
            <WikiImportForm />
          </section>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-700">
          <Info aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
          <p>
            ورود فایل هیچ صفحه‌ای را از محیط مقصد حذف نمی‌کند. تاریخچهٔ ویرایش‌های
            قبلی نیز حفظ می‌شود و تغییرات واردشده به‌عنوان نسخه و رویداد ممیزی تازه
            ثبت می‌شوند.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
