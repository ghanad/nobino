import Link from "next/link";
import { CheckCircle2, ExternalLink, MessageCircle, Unplug } from "lucide-react";

import {
  checkBaleConnectionAction,
  disconnectBaleAccountAction,
} from "@/app/settings/bale/actions";
import { BaleLinkForm } from "@/app/settings/bale/bale-link-form";
import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireCurrentUser } from "@/lib/auth";
import { getBaleBotUsername } from "@/lib/bale-client";
import { db } from "@/lib/db";
import { formatJalaliDateTime } from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

type BaleSettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BaleSettingsPage({
  searchParams,
}: BaleSettingsPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const [connection, botUsername] = await Promise.all([
    db.baleConnection.findUnique({
      where: { userId: user.id },
      select: { linkedAt: true },
    }),
    Promise.resolve(getBaleBotUsername()),
  ]);

  return (
    <AppShell user={user}>
      {params?.connected ? (
        <UrlToast
          consumeKeys={["connected"]}
          message="حساب بله با موفقیت متصل شد."
          variant="success"
        />
      ) : null}
      {params?.disconnected ? (
        <UrlToast
          consumeKeys={["disconnected"]}
          message="اتصال حساب بله قطع شد."
          variant="success"
        />
      ) : null}
      {params?.error ? (
        <UrlToast
          consumeKeys={["error"]}
          message={
            params.error === "not-connected"
              ? "هنوز پیام اتصال از بات دریافت نشده است. ابتدا دستور را برای بات ارسال کنید."
              : "ارتباط با بات بله برقرار نشد. تنظیمات سرور را بررسی کنید."
          }
          variant="error"
        />
      ) : null}

      <div className="grid gap-6 text-right" dir="rtl">
        <PageHeader
          subtitle="اعلان‌های رزرو Nobino را در گفت‌وگوی خصوصی بله دریافت کنید."
          title="اتصال پیام‌رسان بله"
        />

        <section className="grid gap-5 rounded-lg border bg-card p-6">
          {connection ? (
            <>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="grid gap-1">
                  <h2 className="font-semibold text-slate-950">حساب متصل است</h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    اتصال در {formatJalaliDateTime(connection.linkedAt)} انجام شده است.
                  </p>
                </div>
              </div>
              <form action={disconnectBaleAccountAction}>
                <Button type="submit" variant="outline">
                  <Unplug className="h-4 w-4" />
                  قطع اتصال
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="grid gap-2">
                  <h2 className="font-semibold text-slate-950">مراحل اتصال</h2>
                  <ol className="list-decimal space-y-1 pr-5 text-sm leading-7 text-muted-foreground">
                    <li>کد اتصال یک‌بارمصرف بسازید.</li>
                    <li>بات Nobino را در بله باز کرده و دستور را برای آن ارسال کنید.</li>
                    <li>به این صفحه برگردید و «بررسی اتصال» را بزنید.</li>
                  </ol>
                </div>
              </div>

              {botUsername ? (
                <Link
                  className={cn(buttonVariants({ variant: "outline" }), "w-fit")}
                  href={`https://ble.ir/${botUsername}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  باز کردن بات در بله
                  <ExternalLink className="h-4 w-4" />
                </Link>
              ) : (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  نام کاربری بات روی سرور تنظیم نشده است؛ از مدیر سامانه لینک بات را دریافت کنید.
                </p>
              )}

              <BaleLinkForm />

              <form action={checkBaleConnectionAction}>
                <Button type="submit" variant="secondary">
                  بررسی اتصال
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
